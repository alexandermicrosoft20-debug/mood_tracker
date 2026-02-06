"""
BehaviorTrace — Realtime LSL Inference (EmotiBit) v2.0
Updated with Threading, Auto-Reconnect, and Smoothing.

This script:
- Spawns background threads to poll LSL streams continuously (Producer).
- Handles connection drops by auto-reconnecting (Watchdog).
- Buffers incoming samples in a thread-safe rolling window.
- Runs a saved scikit-learn model on the main thread (Consumer).
- Smooths predictions using a temporal majority vote.
"""

from pylsl import resolve_streams, StreamInlet, local_clock
import pandas as pd
import numpy as np
import time
import joblib
import threading
from collections import deque, Counter
from copy import deepcopy

# -------------------------
# CONFIGURATION
# -------------------------

# Window length for feature extraction
WINDOW_SECONDS = 10.0

# Inference cadence
STRIDE_SECONDS = 5.0

# Main loop sleep (idle time between strides)
SLEEP_SECONDS = 0.1

# [NEW] Reconnection Watchdog
# If a stream sends no data for this long, we assume it's dead and reconnect.
STREAM_TIMEOUT_SECONDS = 10.0

# [NEW] Prediction Smoothing
# Number of past predictions to keep for majority voting.
SMOOTHING_WINDOW_SIZE = 3

# Map LSL stream names -> training signal names
LSL_TO_SIGNAL = {
    "ACC_X": "ax", "ACC_Y": "ay", "ACC_Z": "az",
    "EDA": "eda",
    "GYRO_X": "gyro_x", "GYRO_Y": "gyro_y", "GYRO_Z": "gyro_z",
    "HR": "heart_rate",
    "MAG_X": "magno_x", "MAG_Y": "magno_y", "MAG_Z": "magno_z",
    "PPG_GRN": "ppg_green", "PPG_IR": "ppg_infrared", "PPG_RED": "ppg_red",
    "SCR_AMP": "skin_con_amp", "SCR_FREQ": "skin_con_freq", "SCR_RIS": "skin_con_rise",
    "TEMP1": "temp",
}

# Signal density requirements
DENSE_SPECS = {
    "ax": 50, "ay": 50, "az": 50,
    "gyro_x": 50, "gyro_y": 50, "gyro_z": 50,
    "magno_x": 50, "magno_y": 50, "magno_z": 50,
    "ppg_red": 50, "ppg_infrared": 50, "ppg_green": 50,
    "eda": 20, "temp": 10,
}

SPARSE_SIGNALS = {"heart_rate", "skin_con_amp", "skin_con_freq", "skin_con_rise"}

# -------------------------
# GLOBAL STATE
# -------------------------

# Shared buffers: {lsl_name: deque([(ts, val), ...])}
# We use a Lock to prevent reading while a thread is writing.
data_lock = threading.Lock()
buffers = {lsl: deque() for lsl in LSL_TO_SIGNAL.keys()}

# Load Model
print("Loading model artifacts...")
try:
    clf = joblib.load("models/emotibit_activity_model.joblib")
    le = joblib.load("models/label_encoder.joblib")
    FEATURE_ORDER = list(getattr(clf, "feature_names_in_", []))
except Exception as e:
    raise RuntimeError(f"Failed to load model: {e}")

# -------------------------
# WORKER THREAD CLASS
# -------------------------

class LSLWorker(threading.Thread):
    """
    Handles LSL discovery and pulling for a single stream type.
    Includes watchdog logic to reconnect if the stream dies.
    """
    def __init__(self, target_lsl_name):
        super().__init__()
        self.target_name = target_lsl_name
        self.inlet = None
        self.last_sample_time = time.time()
        self.running = True
        self.daemon = True # Kills thread if main program exits

    def run(self):
        print(f"[{self.target_name}] Worker started.")
        while self.running:
            # 1. CONNECT: If no inlet, try to find one
            if self.inlet is None:
                self._attempt_connection()
                time.sleep(1.0) # Avoid tight loops if device is off
                continue

            # 2. PULL: Try to get data
            try:
                # Timeout is small to keep thread responsive
                chunk, ts_list = self.inlet.pull_chunk(timeout=1.0, max_samples=512)
                
                if ts_list:
                    # Update watchdog timer
                    self.last_sample_time = time.time()
                    
                    # WRITE TO SHARED BUFFER
                    with data_lock:
                        dq = buffers[self.target_name]
                        for samp, ts in zip(chunk, ts_list):
                            dq.append((float(ts), float(samp[0])))
                else:
                    # 3. WATCHDOG: Check for timeout
                    if time.time() - self.last_sample_time > STREAM_TIMEOUT_SECONDS:
                        print(f"[{self.target_name}] Watchdog timeout! Reconnecting...")
                        self._disconnect()

            except Exception as e:
                print(f"[{self.target_name}] Error pulling data: {e}")
                self._disconnect()

    def _attempt_connection(self):
        """Scan available LSL streams for one matching our target name."""
        streams = resolve_streams(wait_time=1.0)
        for s in streams:
            if s.name() == self.target_name:
                try:
                    self.inlet = StreamInlet(s, max_buflen=60, processing_flags=0)
                    self.last_sample_time = time.time() # Reset watchdog
                    print(f"[{self.target_name}] Connected.")
                    return
                except Exception as e:
                    print(f"[{self.target_name}] Connection failed: {e}")

    def _disconnect(self):
        """Cleanly close inlet to allow re-discovery."""
        if self.inlet:
            try:
                self.inlet.close_stream()
            except: 
                pass
        self.inlet = None

# -------------------------
# FEATURE EXTRACTION
# -------------------------

def get_snapshot(now_lsl):
    """
    Thread-safe way to get a copy of current data for inference.
    Prunes old data and returns a deep copy of the window.
    """
    snapshot = {}
    cutoff = now_lsl - WINDOW_SECONDS
    
    with data_lock:
        for lsl_name, dq in buffers.items():
            # 1. Prune old data (in place)
            while dq and dq[0][0] < cutoff:
                dq.popleft()
            
            # 2. Copy data for processing (so we can release lock quickly)
            # Converting to list is faster than deepcopying the deque structure
            snapshot[lsl_name] = list(dq)
            
    return snapshot

def dense_features(sig, data_list):
    """Calculates features for dense signals (ACC, PPG, etc)."""
    n = len(data_list)
    min_samples = DENSE_SPECS[sig]
    
    if n < min_samples:
        return None, f"{sig} n={n} < {min_samples}"
        
    # [OPTIMIZATION] Convert to numpy array once
    arr = np.array(data_list) # shape (N, 2) -> col 0=ts, col 1=val
    ts = arr[:, 0]
    v = arr[:, 1]
    
    span = ts[-1] - ts[0]
    dt = np.diff(ts)
    mean_dt = np.mean(dt) if len(dt) > 0 else 0
    
    # NOTE: Keeping 'energy' as sum(v**2) to match legacy training logic.
    # For new models, prefer mean(v**2) (RMS) to be robust to sample count.
    feats = {
        f"{sig}_mean": float(np.mean(v)),
        f"{sig}_std": float(np.std(v)),
        f"{sig}_min": float(np.min(v)),
        f"{sig}_max": float(np.max(v)),
        f"{sig}_energy": float(np.sum(v ** 2)), 
        f"{sig}_samples": float(n),
        f"{sig}_mean_dt": float(mean_dt),
        f"{sig}_effective_hz": (1.0/mean_dt) if mean_dt > 0 else 0,
        f"{sig}_coverage": float(span / WINDOW_SECONDS) if WINDOW_SECONDS > 0 else 0,
    }
    return feats, None

def sparse_features(sig, data_list, now_lsl):
    """Calculates features for sparse events (SCR, HR)."""
    n = len(data_list)
    feats = {f"{sig}_count": float(n)}
    
    if n == 0:
        feats.update({
            f"{sig}_last": np.nan,
            f"{sig}_time_since_last": float(WINDOW_SECONDS),
            f"{sig}_mean": np.nan,
            f"{sig}_std": np.nan
        })
        return feats
        
    vals = [x[1] for x in data_list]
    last_ts = data_list[-1][0]
    last_val = data_list[-1][1]
    
    feats.update({
        f"{sig}_last": float(last_val),
        f"{sig}_time_since_last": float(now_lsl - last_ts),
        f"{sig}_mean": float(np.mean(vals)),
        f"{sig}_std": float(np.std(vals) if n > 1 else 0.0)
    })
    return feats

def compute_feature_vector(snapshot, now_lsl):
    """Aggregates features from all streams into a single dict."""
    full_feats = {}
    errors = []
    
    for lsl_name, sig in LSL_TO_SIGNAL.items():
        data = snapshot.get(lsl_name, [])
        
        if sig in DENSE_SPECS:
            f, err = dense_features(sig, data)
            if err: errors.append(err)
            else: full_feats.update(f)
            
        elif sig in SPARSE_SIGNALS:
            full_feats.update(sparse_features(sig, data, now_lsl))
            
    # Check for missing columns expected by model
    missing = [c for c in FEATURE_ORDER if c not in full_feats]
    if missing:
        errors.append(f"Missing model features: {len(missing)}")
        
    return full_feats, errors

# -------------------------
# SMOOTHING UTILS
# -------------------------

pred_history = deque(maxlen=SMOOTHING_WINDOW_SIZE)

def get_smoothed_prediction(new_label):
    """
    Adds new label to history and returns the majority vote.
    """
    pred_history.append(new_label)
    # Count occurrences of each label in history
    counts = Counter(pred_history)
    # Return the most common label
    most_common = counts.most_common(1)[0][0]
    return most_common

# -------------------------
# MAIN EXECUTION
# -------------------------

def main():
    print("--- Starting LSL Worker Threads ---")
    
    # 1. Start a worker thread for each expected LSL stream
    workers = []
    for lsl_name in LSL_TO_SIGNAL.keys():
        w = LSLWorker(lsl_name)
        w.start()
        workers.append(w)
        
    print(f"Launched {len(workers)} threads. Waiting for data...")
    time.sleep(2.0) # Warmup
    
    last_pred_time = 0.0
    
    try:
        while True:
            now_lsl = local_clock()
            
            # Check cadence
            if now_lsl - last_pred_time < STRIDE_SECONDS:
                time.sleep(SLEEP_SECONDS)
                continue
                
            last_pred_time = now_lsl
            
            # 2. Get Thread-Safe Snapshot
            snapshot = get_snapshot(now_lsl)
            
            # 3. Compute Features
            feats, errors = compute_feature_vector(snapshot, now_lsl)
            
            if errors:
                # [OPTIONAL] Print errors if you need to debug stream loss
                # print(f"[SKIP] {errors[0]} ...")
                continue
                
            # 4. Predict
            try:
                # Create DataFrame with exact column order
                X = pd.DataFrame([feats], columns=FEATURE_ORDER)
                
                # Raw prediction
                raw_label = le.inverse_transform(clf.predict(X))[0]
                
                # Confidence
                conf = 0.0
                if hasattr(clf, "predict_proba"):
                    conf = np.max(clf.predict_proba(X)[0])
                    
                # 5. Apply Smoothing
                final_label = get_smoothed_prediction(raw_label)
                
                # Formatting output
                ts_str = time.strftime("%H:%M:%S")
                smooth_tag = "*" if final_label != raw_label else " "
                
                print(f"[{ts_str}] {smooth_tag} Pred: {final_label:12s} (Raw: {raw_label:12s} Conf: {conf:.2f})")
                
            except Exception as e:
                print(f"[ERROR] Inference failed: {e}")
                
    except KeyboardInterrupt:
        print("\nStopping workers...")
        for w in workers:
            w.running = False
        print("Done.")

if __name__ == "__main__":
    main()