# Student Workbook: Touch Stop Safety Collector

## Mission

Collect touch and motion readings for a safety-stop classifier.

You will teach the computer to tell the difference between normal movement and a
pressed-stop event. The project uses motors `A` and `B`, gyro sensor `S3`, and
touch sensor `S4`.

Estimated time: 15 minutes.

## Materials

- EV3 robot with motors `A` and `B`
- Gyro sensor `S3`
- Touch sensor `S4`
- Scratch with the VSLE-EV3 extension
- WeisileAI Trainer connected to WeisileLink

## Labels

Use exactly these labels:

- `moving`
- `pressed-stop`

## Features

The Trainer will use these EV3 features:

- `touch_pressed`
- `gyro_angle`
- `motor_a_pos`

## Step 1: record

1. Start data collection with label `moving`.
2. Run motors `A` and `B` together at a safe classroom speed.
3. Stop data collection.
4. Start data collection with label `pressed-stop`.
5. Press touch sensor `S4`.
6. Use the EV3 stop command so the robot stops safely.
7. Stop data collection.

Check: `touch_pressed` should be different for `moving` and `pressed-stop`.

## Step 2: upload

Upload the buffered rows to WeisileAI Trainer.

Check: the Trainer chart should include both `moving` and `pressed-stop` rows.

## Step 3: train

Train a decision tree. Keep the model only if it reaches the 70% accuracy gate.

If accuracy is below the gate:

- collect more pressed-stop examples;
- keep the robot motion consistent during moving examples;
- make sure `S4` is pressed only during the `pressed-stop` label;
- train again.

## Step 4: export

Export both files:

- `vsle_ev3_data.csv`
- `model_rules.json`

After export, ask the teacher before clearing the buffer with `/api/data/clear`.

## Prediction test

Run the robot without pressing `S4`:

```text
Prediction:
Evidence from touch and motion values:
```

Press `S4` during a new test:

```text
Prediction:
Evidence from touch and motion values:
```

## Reflection

1. Was `touch_pressed` enough by itself?
2. Did `gyro_angle` or `motor_a_pos` show anything useful about movement?
3. What would make this safety classifier fail in a real classroom?

## Privacy

No names, photos, or voice recordings belong in this dataset. Use only the two
classroom labels and EV3 sensor values.
