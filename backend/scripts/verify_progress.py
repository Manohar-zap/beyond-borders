import re
import json
import os

# Check sectors router for /registry endpoint
with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\backend\app\routers\sectors.py") as f:
    content = f.read()
    if "/registry" in content:
        print("PASS: /api/sectors/registry endpoint exists in sectors.py")
    else:
        print("FAIL: /api/sectors/registry endpoint NOT found in sectors.py")

# Check forecast.py for rolling_origin_validate
with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\backend\scripts\forecast.py") as f:
    content = f.read()
    if "rolling_origin_validate" in content:
        print("PASS: rolling_origin_validate function exists in forecast.py")
    else:
        print("FAIL: rolling_origin_validate function NOT found in forecast.py")

# Check metadata.json for degree_to_occupation
with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\backend\data\processed\metadata.json") as f:
    meta = json.load(f)
    if "degree_to_occupation" in meta:
        print("PASS: degree_to_occupation exists in metadata.json")
    else:
        print("FAIL: degree_to_occupation NOT found in metadata.json")

# Check industrial_projects.parquet
if os.path.exists(r"C:\Users\zapma\CODES\R programming\beyond-borders\backend\data\processed\industrial_projects.parquet"):
    print("PASS: industrial_projects.parquet exists")
else:
    print("FAIL: industrial_projects.parquet NOT found")

# Check config.py for industrial_projects in DATASETS
with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\backend\app\config.py") as f:
    content = f.read()
    if "industrial_projects" in content:
        print("PASS: industrial_projects in DATASETS in config.py")
    else:
        print("FAIL: industrial_projects NOT in DATASETS in config.py")

# Check salary VALUE_KEYS
with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\frontend\app\salary\page.tsx") as f:
    content = f.read()
    if "BASIS_LABELS" in content and "VALUE_KEYS" in content:
        print("PASS: salary page has BASIS_LABELS and VALUE_KEYS")
    else:
        print("FAIL: salary page missing BASIS_LABELS or VALUE_KEYS")

# Check living cost categories in frontend
with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\frontend\app\living-cost\page.tsx") as f:
    content = f.read()
    if "expense_category" in content:
        print("PASS: living cost page has expense_category separation")
    else:
        print("FAIL: living cost page missing expense_category separation")