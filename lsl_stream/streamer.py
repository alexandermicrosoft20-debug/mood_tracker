"""
BehaviorTrace — LSL Stream Test Utility
Written by Paul Gedrimas — 12/2025

This script:
- Discovers all available LSL (Lab Streaming Layer) EmotiBit streams on the network
- Connects to each stream without filtering by name or type
- Continuously pulls samples from every stream
- Prints stream name, first channel value, and timestamp in real time

Purpose:
- Simple diagnostics and validation tool
- Used to confirm that LSL streams (e.g. EmotiBit) are publishing data correctly
- Not used in conjunction with the main BehaviorTrace pipeline

Notes:
- pull_sample(timeout=0.0) makes this a non-blocking read
- Assumes single-channel streams (sample[0])
- time.sleep(0.01) prevents excessive CPU usage
"""

from pylsl import resolve_streams, StreamInlet
import time

# -------------------------
# DISCOVER LSL STREAMS
# -------------------------

# Resolve all available LSL streams on the network
streams = resolve_streams()
inlets = []

# Create an inlet for each discovered stream
for s in streams:
    inlet = StreamInlet(s)
    inlets.append((s.name(), inlet))
    print(f"Connected to {s.name()}")

print("\n--- Streaming ---\n")

# -------------------------
# MAIN LOOP
# -------------------------
while True:
    # Iterate through all connected streams
    for name, inlet in inlets:
        # Non-blocking sample pull
        sample, timestamp = inlet.pull_sample(timeout=0.0)

        # If a sample is available, print it
        if sample is not None:
            print(f"{name:12s} | {sample[0]:>8.4f} | {timestamp:.3f}")

    # Small sleep to avoid tight-loop CPU usage
    time.sleep(0.01)
