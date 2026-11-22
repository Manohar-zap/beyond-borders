import sys
sys.path.insert(0, r'C:\Users\zapma\CODES\R programming\beyond-borders\backend')
from scripts.forecast import rolling_origin_validate
import numpy as np

# Test with some sample data
values = np.array([10.0, 11.0, 12.0, 13.0, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0])
results = rolling_origin_validate(values)
print(f"Rolling origin results: {len(results)} rolls")
for i, r in enumerate(results[:3]):
    print(f"  Roll {i}: {r}")