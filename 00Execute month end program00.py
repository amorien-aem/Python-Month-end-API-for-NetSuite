import subprocess
import sys
import os

# List of Python scripts to run
scripts = [
    "1preliminary.py",
    "2AccountsReceivable.py",
    "3AccountsPayable.py",
    "4BankReconciliation.py",
    "5Inventory.py",
    "6AccrualsAdjustments.py",
    "7ReviewFinancials.py",
    "8LockClosePeriod.py",
]

python_exe = sys.executable or 'python'

for script in scripts:
    script_path = os.path.join(os.path.dirname(__file__), script)
    try:
        # Run the script with HEADLESS env if present
        result = subprocess.run([python_exe, script_path], check=True, capture_output=True, text=True, env={**os.environ, 'HEADLESS': os.environ.get('HEADLESS', '1')})
        print(f"{script} completed successfully.")
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr)
    except subprocess.CalledProcessError as e:
        print(f"Error occurred while running {script}: {e}")
        if e.stdout:
            print(e.stdout)
        if e.stderr:
            print(e.stderr)
        # stop further execution on failure
        sys.exit(1)