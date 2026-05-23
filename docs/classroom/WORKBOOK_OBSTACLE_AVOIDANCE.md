# Student Workbook: Obstacle Avoidance Collector

## Mission

Collect safe-zone and obstacle-zone EV3 readings for an AI Quest obstacle classifier.

You will teach the computer to notice when the robot is near an obstacle. The
project uses motor `A`, ultrasonic sensor `S2`, and touch sensor `S4`.

Estimated time: 20 minutes.

## Materials

- EV3 robot with motor `A`
- Ultrasonic sensor `S2`
- Touch sensor `S4`
- Scratch with the VSLE-EV3 extension
- WeisileAI Trainer connected to WeisileLink

## Labels

Use exactly these labels:

- `safe-zone`
- `obstacle-zone`

## Features

The Trainer will use these EV3 features:

- `ultrasonic_cm`
- `touch_pressed`
- `gyro_angle`
- `motor_a_pos`

## Step 1: record

1. Start data collection with label `safe-zone`.
2. Run motor `A` forward at a safe classroom speed.
3. Keep the robot away from obstacles while it records.
4. Stop data collection.
5. Start data collection with label `obstacle-zone`.
6. Move the obstacle close enough to press touch sensor `S4` or make distance
   clearly small.
7. Stop data collection.

Check: your two labels should both have rows in the local data buffer.

## Step 2: upload

Upload the buffered rows to WeisileAI Trainer.

Check: the Trainer chart should show rows for `safe-zone` and `obstacle-zone`.

## Step 3: train

Train a decision tree. Keep the model only if it reaches the 70% accuracy gate.

If accuracy is below the gate:

- collect more examples for the label with fewer rows;
- remove readings where the robot was between safe and obstacle zones;
- train again.

## Step 4: export

Export both files:

- `vsle_ev3_data.csv`
- `model_rules.json`

After export, ask the teacher before clearing the buffer with `/api/data/clear`.

## Prediction test

Place the robot in a new safe location and write the predicted label:

```text
Prediction:
Evidence from sensor values:
```

Place the robot near a new obstacle and write the predicted label:

```text
Prediction:
Evidence from sensor values:
```

## Reflection

1. Which feature was most useful: `ultrasonic_cm`, `touch_pressed`,
   `gyro_angle`, or `motor_a_pos`?
2. What physical situation made the model unsure?
3. What new examples would improve the model?

## Privacy

No names, photos, or voice recordings belong in this dataset. Use only the two
classroom labels and EV3 sensor values.
