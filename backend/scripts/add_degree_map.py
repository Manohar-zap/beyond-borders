import json

with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\backend\data\processed\metadata.json", "r") as f:
    meta = json.load(f)

degree_map = {
    "less_than_high_school": {
        "name": "Less than high school",
        "occupations": ["6", "7", "8", "9"],
    },
    "high_school": {
        "name": "High school",
        "occupations": ["4", "5", "9"],
    },
    "some_college": {
        "name": "Some college",
        "occupations": ["2", "3"],
    },
    "bachelors": {
        "name": "Bachelor's degree",
        "occupations": ["2"],
    },
    "graduate": {
        "name": "Graduate degree",
        "occupations": ["2"],
    },
}

meta["degree_to_occupation"] = degree_map

with open(r"C:\Users\zapma\CODES\R programming\beyond-borders\backend\data\processed\metadata.json", "w") as f:
    json.dump(meta, f, indent=2)

print("Added degree_to_occupation to metadata.json")