"""
BehaviorTrace — EmotiBit Windowed Feature Extraction & Activity Classification
Written by Paul Gedrimas — 12/2025

This script:
- Loads labeled time intervals and raw EmotiBit sensor CSVs
- Windows biosignal data using a sliding window
- Extracts dense and sparse signal features
- Trains a Random Forest classifier
- Evaluates performance
- Saves the trained model and label encoder
"""

import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

# -------------------------
# CONFIGURATION
# -------------------------

# Directory containing training CSV files
DATA_DIR = Path("training_data")

# Sliding window parameters
WINDOW_SECONDS = 10
STRIDE_SECONDS = 5

# Label used when a window does not fall inside a labeled interval
UNKNOWN_LABEL = "unknown"

# Convert window parameters to pandas timedeltas
WINDOW = pd.Timedelta(seconds=WINDOW_SECONDS)
STRIDE = pd.Timedelta(seconds=STRIDE_SECONDS)

# -------------------------
# SIGNAL DEFINITIONS
# -------------------------
# Each signal is defined as either:
# - dense: sampled frequently (requires a minimum sample count)
# - sparse: irregular events (e.g., heart rate updates)

SIGNAL_SPECS = {
    # Accelerometer (≈25 Hz)
    "ax": {"type": "dense", "min_samples": 50},
    "ay": {"type": "dense", "min_samples": 50},
    "az": {"type": "dense", "min_samples": 50},

    # Gyroscope
    "gyro_x": {"type": "dense", "min_samples": 50},
    "gyro_y": {"type": "dense", "min_samples": 50},
    "gyro_z": {"type": "dense", "min_samples": 50},

    # Magnetometer
    "magno_x": {"type": "dense", "min_samples": 50},
    "magno_y": {"type": "dense", "min_samples": 50},
    "magno_z": {"type": "dense", "min_samples": 50},

    # PPG channels
    "ppg_red": {"type": "dense", "min_samples": 50},
    "ppg_infrared": {"type": "dense", "min_samples": 50},
    "ppg_green": {"type": "dense", "min_samples": 50},

    # Electrodermal activity (~15 Hz)
    "eda": {"type": "dense", "min_samples": 20},

    # Skin temperature (~7.5 Hz)
    "temp": {"type": "dense", "min_samples": 10},

    # Sparse physiological events
    "heart_rate": {"type": "sparse"},
    "skin_con_amp": {"type": "sparse"},
    "skin_con_freq": {"type": "sparse"},
    "skin_con_rise": {"type": "sparse"},
}

# Convenience list of signal names
SIGNALS = list(SIGNAL_SPECS.keys())

# -------------------------
# LOAD LABEL INTERVALS
# -------------------------
# CSV must contain:
# - started_at
# - ended_at
# - label_name
labels = pd.read_csv(
    DATA_DIR / "label_intervals.csv",
    parse_dates=["started_at", "ended_at"]
).sort_values("started_at").reset_index(drop=True)

# -------------------------
# LOAD SENSOR CSV FILES
# -------------------------
def load_sensor(name: str) -> pd.DataFrame:
    """
    Load a single sensor CSV and standardize columns.
    """
    df = pd.read_csv(DATA_DIR / f"emotibit_{name}.csv", parse_dates=["recorded_at"])
    df = df.sort_values("recorded_at")
    df = df[["recorded_at", "value"]].rename(columns={"value": name})
    return df

# Load all sensor data into a dictionary
sensors = {s: load_sensor(s) for s in SIGNALS}

# -------------------------
# FEATURE EXTRACTION
# -------------------------
def dense_features(df, col, t0, t1, min_samples):
    """
    Extract statistical and timing features from dense signals.
    """
    w = df[(df["recorded_at"] >= t0) & (df["recorded_at"] < t1)]
    n = len(w)

    # Skip window if too few samples
    if n < min_samples:
        return None

    v = w[col].to_numpy(dtype=float)
    ts = w["recorded_at"].to_numpy(dtype="datetime64[ns]").astype("int64") / 1e9
    dt = np.diff(ts)

    mean_dt = float(np.mean(dt)) if len(dt) else np.nan
    eff_hz = float(1.0 / mean_dt) if mean_dt and mean_dt > 0 else np.nan
    span = float(ts[-1] - ts[0]) if n >= 2 else 0.0

    return {
        f"{col}_mean": float(np.mean(v)),
        f"{col}_std": float(np.std(v)),
        f"{col}_min": float(np.min(v)),
        f"{col}_max": float(np.max(v)),
        f"{col}_energy": float(np.sum(v ** 2)),
        f"{col}_samples": float(n),
        f"{col}_mean_dt": mean_dt,
        f"{col}_effective_hz": eff_hz,
        f"{col}_coverage": float(span / WINDOW_SECONDS),
    }

def sparse_features(df, col, t0, t1):
    """
    Extract event-based features from sparse signals.
    """
    w = df[(df["recorded_at"] >= t0) & (df["recorded_at"] < t1)]
    n = len(w)

    feats = {f"{col}_count": float(n)}

    # No events in window
    if n == 0:
        feats.update({
            f"{col}_last": np.nan,
            f"{col}_time_since_last": float(WINDOW_SECONDS),
            f"{col}_mean": np.nan,
            f"{col}_std": np.nan,
        })
        return feats

    # At least one event
    last_time = w["recorded_at"].iloc[-1]
    feats[f"{col}_last"] = float(w[col].iloc[-1])
    feats[f"{col}_time_since_last"] = float((t1 - last_time).total_seconds())

    if n >= 2:
        v = w[col].to_numpy(dtype=float)
        feats[f"{col}_mean"] = float(np.mean(v))
        feats[f"{col}_std"] = float(np.std(v))
    else:
        feats[f"{col}_mean"] = float(w[col].iloc[-1])
        feats[f"{col}_std"] = 0.0

    return feats

def extract_window_features(t0, t1):
    """
    Extract features for all signals in a single window.
    """
    feats = {}
    for sig, spec in SIGNAL_SPECS.items():
        df = sensors[sig]
        if spec["type"] == "dense":
            f = dense_features(df, sig, t0, t1, spec["min_samples"])
            if f is None:
                return None  # drop window if any dense signal is missing
            feats.update(f)
        else:
            feats.update(sparse_features(df, sig, t0, t1))
    return feats

# -------------------------
# LABEL ASSIGNMENT
# -------------------------
def label_for_window(t0, t1):
    """
    Assign a label if the window is fully contained within a label interval.
    """
    for _, row in labels.iterrows():
        if t0 >= row.started_at and t1 <= row.ended_at:
            return row.label_name
        if row.started_at > t1:
            break
    return UNKNOWN_LABEL

# -------------------------
# WINDOWING
# -------------------------
start = min(df["recorded_at"].min() for df in sensors.values())
end = max(df["recorded_at"].max() for df in sensors.values())

X, y = [], []
t = start
skipped = 0

while t + WINDOW <= end:
    t_end = t + WINDOW
    feats = extract_window_features(t, t_end)

    if feats is None:
        skipped += 1
        t += STRIDE
        continue

    X.append(feats)
    y.append(label_for_window(t, t_end))
    t += STRIDE

X = pd.DataFrame(X)
y = np.array(y)

print("Windows kept:", len(y), "Skipped:", skipped)
print("Label distribution:")
print(pd.Series(y).value_counts())

# -------------------------
# ENCODE LABELS & SPLIT DATA
# -------------------------
le = LabelEncoder()
y_enc = le.fit_transform(y)

X_train, X_test, y_train, y_test = train_test_split(
    X, y_enc,
    test_size=0.2,
    stratify=y_enc,
    random_state=42
)

# -------------------------
# TRAIN MODEL
# -------------------------
clf = RandomForestClassifier(
    n_estimators=500,
    n_jobs=-1,
    class_weight="balanced",
    random_state=42
)
clf.fit(X_train, y_train)

# -------------------------
# EVALUATION
# -------------------------
y_pred = clf.predict(X_test)
print(classification_report(y_test, y_pred, target_names=le.classes_))

# -------------------------
# SAVE MODEL ARTIFACTS
# -------------------------
Path("models").mkdir(exist_ok=True)
joblib.dump(clf, "models/emotibit_activity_model.joblib")
joblib.dump(le, "models/label_encoder.joblib")

print("Model saved.")
