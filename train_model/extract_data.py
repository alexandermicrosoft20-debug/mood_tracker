"""
BehaviorTrace — Supabase Export to Training CSVs
Written by Paul Gedrimas — 12/2025

This script:
- Connects to Supabase using a Service Role key (bypasses RLS)
- Downloads all rows from EmotiBit signal tables using PostgREST pagination
- Exports each signal table to CSV in ./training_data/
- Exports label intervals (user_states joined to labels) to label_intervals.csv

Output files:
- training_data/emotibit_*.csv  (device_id, recorded_at, value)
- training_data/label_intervals.csv (user_id, form_id, started_at, ended_at, label_name)
"""

import os
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

# tqdm is optional; if unavailable, script still works without progress bars
try:
    from tqdm import tqdm
except ImportError:
    tqdm = None

# -----------------------------
# CONFIG
# -----------------------------

# Load environment variables from .env (local dev convenience)
load_dotenv()

# Supabase connection details
SUPABASE_URL = os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")  # Service role bypasses RLS

# Validate required environment variables exist
if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")

# Initialize Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Output directory where CSVs will be saved
OUT_DIR = "training_data"
os.makedirs(OUT_DIR, exist_ok=True)

# Pagination size (PostgREST often caps responses at ~1000 rows per request)
PAGE_SIZE = 1000

# List of tables to export (each becomes training_data/<table>.csv)
SIGNAL_TABLES = [
    "emotibit_ax",
    "emotibit_ay",
    "emotibit_az",
    "emotibit_eda",
    "emotibit_edl",
    "emotibit_gyro_x",
    "emotibit_gyro_y",
    "emotibit_gyro_z",
    "emotibit_heart_rate",
    "emotibit_humidity",
    "emotibit_inter_beat",
    "emotibit_magno_x",
    "emotibit_magno_y",
    "emotibit_magno_z",
    "emotibit_ppg_green",
    "emotibit_ppg_infrared",
    "emotibit_ppg_red",
    "emotibit_skin_con_amp",
    "emotibit_skin_con_freq",
    "emotibit_skin_con_rise",
    "emotibit_temp",
]

# -----------------------------
# HELPERS
# -----------------------------
def fetch_all_rows(table: str, columns: str, order_col: str, pbar=None):
    """
    Fetch all rows from a Supabase table with pagination using .range().

    Args:
      table: table name in Supabase (PostgREST endpoint)
      columns: select columns string (e.g., "device_id,recorded_at,value")
      order_col: column to order by (stable pagination)
      pbar: optional tqdm progress bar to update as rows are fetched

    Returns:
      List[dict] of rows.
    """
    all_rows = []
    offset = 0

    while True:
        # Request a page of rows using an inclusive range: [offset, offset+PAGE_SIZE-1]
        q = (
            supabase.table(table)
            .select(columns)
            .order(order_col, desc=False)
            .range(offset, offset + PAGE_SIZE - 1)
        )

        res = q.execute()
        page = res.data or []

        # No rows returned -> done
        if not page:
            break

        all_rows.extend(page)

        # Update progress bar if available
        if pbar is not None:
            pbar.update(len(page))

        # Short page indicates we've reached the end
        if len(page) < PAGE_SIZE:
            break

        offset += PAGE_SIZE

    return all_rows


def export_signal_table(table: str):
    """
    Export one EmotiBit signal table to CSV with a standardized schema:
      device_id, recorded_at, value
    """
    # Optional progress bar for row download (total unknown)
    row_pbar = tqdm(desc=f"Downloading {table}", unit="rows", leave=False) if tqdm else None

    rows = fetch_all_rows(
        table=table,
        columns="device_id,recorded_at,value",
        order_col="recorded_at",
        pbar=row_pbar,
    )

    if row_pbar is not None:
        row_pbar.close()

    # Convert to DataFrame with consistent column order
    df = pd.DataFrame(rows, columns=["device_id", "recorded_at", "value"])

    # Normalize recorded_at formatting:
    # - parse as UTC timestamps
    # - emit consistent string format with microseconds + timezone offset
    df["recorded_at"] = (
        pd.to_datetime(df["recorded_at"], utc=True)
        .dt.strftime("%Y-%m-%d %H:%M:%S.%f%z")
    )

    # Write to disk
    out_path = os.path.join(OUT_DIR, f"{table}.csv")
    df.to_csv(out_path, index=False)

    return len(df), out_path


def export_label_intervals():
    """
    Export labeled intervals for training.

    Uses a nested select:
      user_states(..., labels(label_name))

    Requires FK relationship:
      user_states.label_id -> labels.id

    Output CSV schema:
      user_id, form_id, started_at, ended_at, label_name
    """
    rows = fetch_all_rows(
        table="user_states",
        columns="user_id,form_id,started_at,ended_at,labels(label_name)",
        order_col="started_at",
    )

    df = pd.DataFrame(rows)

    # Flatten nested "labels" object into a top-level "label_name"
    def extract_label_name(x):
        if isinstance(x, dict):
            return x.get("label_name")
        return None

    df["label_name"] = df["labels"].apply(extract_label_name)
    df = df.drop(columns=["labels"], errors="ignore")

    # Only keep rows that have an ended_at (complete intervals)
    df = df[df["ended_at"].notna()]

    # Enforce column order
    df = df[["user_id", "form_id", "started_at", "ended_at", "label_name"]]

    out_path = os.path.join(OUT_DIR, "label_intervals.csv")
    df.to_csv(out_path, index=False)

    return len(df), out_path


def main():
    """
    Export all configured signal tables + label intervals into OUT_DIR.
    """
    total_exported = 0

    # Optional progress bar over tables
    iterator = tqdm(SIGNAL_TABLES, desc="Exporting signal tables", unit="table") if tqdm else SIGNAL_TABLES

    for table in iterator:
        n, path = export_signal_table(table)
        total_exported += n

        # If tqdm is missing, print per-table status
        if not tqdm:
            print(f"{table}: {n} rows -> {path}")

    # Export label intervals after signals
    n_labels, path_labels = export_label_intervals()
    if not tqdm:
        print(f"label_intervals: {n_labels} rows -> {path_labels}")

    print(f"\nDone. Exported {total_exported} signal rows + {n_labels} label rows into '{OUT_DIR}/'.")


# Standard Python entry point guard
if __name__ == "__main__":
    main()
