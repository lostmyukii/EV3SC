# Student Workbook: Line Patrol Color Collector

## Mission

Collect reflected-light readings for a line and floor classifier.

You will teach the computer to tell whether the robot is over a dark line or the
floor around it. The project uses motors `A` and `B`, color sensor `S1`, and
gyro sensor `S3`.

Estimated time: 18 minutes.

## Materials

- EV3 robot with motors `A` and `B`
- Color sensor `S1`
- Gyro sensor `S3`
- A line mat or dark tape on a light surface
- Scratch with the VSLE-EV3 extension
- WeisileAI Trainer connected to WeisileLink

## Labels

Use exactly these labels:

- `line`
- `floor`

## Features

The Trainer will use these EV3 features:

- `color_reflected`
- `gyro_angle`
- `motor_a_pos`

## Step 1: record

1. Place color sensor `S1` over the line.
2. Start data collection with label `line`.
3. Run motors `A` and `B` together slowly across the line.
4. Stop data collection.
5. Place color sensor `S1` over the floor.
6. Start data collection with label `floor`.
7. Run motors `A` and `B` slowly over the floor area.
8. Stop data collection.

Check: reflected light should be different for `line` and `floor`.

## Step 2: upload

Upload the buffered rows to WeisileAI Trainer.

Check: the Trainer chart should include both `line` and `floor` rows.

## Step 3: train

Train a decision tree. Keep the model only if it reaches the 70% accuracy gate.

If accuracy is below the gate:

- collect line readings from several positions on the tape;
- collect floor readings from several positions near the tape;
- avoid shadows from hands or robot cables;
- train again.

## Step 4: export

Export both files:

- `vsle_ev3_data.csv`
- `model_rules.json`

After export, ask the teacher before clearing the buffer with `/api/data/clear`.

## Prediction test

Move the robot over a new part of the line:

```text
Prediction:
Evidence from reflected light:
```

Move the robot over a new floor area:

```text
Prediction:
Evidence from reflected light:
```

## Reflection

1. Was `color_reflected` enough by itself, or did `gyro_angle` or `motor_a_pos`
   help?
2. What happened when the sensor was half on the line and half on the floor?
3. How would you collect better examples next time?

## Privacy

No names, photos, or voice recordings belong in this dataset. Use only the two
classroom labels and EV3 sensor values.
