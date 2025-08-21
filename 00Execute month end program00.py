import subprocess

# List of Python scripts to run
scripts = ["1preliminary.py", 
           "2AccountsReceivable.py", 
           "3AccountsPayable.py", 
           "4BankReconciliation.py",
           "5Inventory.py", 
           "6AccrualsAdjustments.py", 
           "7ReviewFinancials.py", 
           "8LockClosePeriod.py"]

for script in scripts:
    try:
        # Run the script and wait for it to complete
        subprocess.run(["python", script], check=True)
        print(f"{script} completed successfully.")
    except subprocess.CalledProcessError as e:
        print(f"Error occurred while running {script}: {e}")
        break