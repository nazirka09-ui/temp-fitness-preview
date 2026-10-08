# Nutrition catalog

The starter catalog contains 101 translated foods/dishes in 13 categories from USDA FoodData Central, FNDDS 2021–2023 (published October 31, 2024).

- Source: https://fdc.nal.usda.gov/download-datasets/
- Archive: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip
- License: CC0 1.0 / public domain; https://fdc.nal.usda.gov/api-guide/
- Each entry retains its FDC ID, original English description, four source nutrient values per 100 g and source portion description.
- Portion weight uses the first ordered positive household measure excluding “Quantity not specified”. These are reference portions, not measured population averages. The interface identifies them as approximations; users can choose 100 g or their own gram amount.
- Prepared dishes are recipe-dependent. Russian names identify source variants; for example, undressed salads are explicitly labeled as such. No nutrition values are synthesized from the dish name.

To regenerate `food-catalog.mjs`, unzip the source archive and run:

```sh
python3 scripts/build-food-catalog.py /path/to/surveyDownload.json
```

All four totals are `source_per_100g * consumed_grams / 100`, rounded to two decimal places for storage. Diary and dashboard sum stored consumed totals. User custom dishes provide their own values per 100 g.

Meals, consumed gram weights and the nutrient snapshot are stored alongside existing diary records in `temp-health-v1`. Existing manually entered records keep their original totals and appear under “Без приёма пищи”. Favorite IDs, recently used IDs and user-created foods use `temp-food-preferences-v1`. The catalog and calculation module are cached by the service worker for offline use.
