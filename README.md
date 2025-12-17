ANC Band Analysis & Comparison Tool

A specialized web-based visualization tool designed to quantify the effectiveness of Active Noise Control (ANC) prototypes. This tool accepts exported acoustic measurements and provides interactive analysis of noise reduction performance across specific frequency bands.

Features

Dual-Spectrum Visualization: Plots "Before" and "After" ANC datasets on a logarithmic frequency scale (20Hz - 20kHz).

Difference Analysis: Automatically computes and visualizes the reduction curve (Difference in dB).

Interactive Band Selection: Users can drag handles on the chart to isolate specific frequency ranges (e.g., the target ANC range of 200Hz-1kHz).

Real-time Metrics: Instantly calculates:

Average SPL (Before vs. After)

Absolute dB Reduction ($\Delta$dB)

Acoustic Power Reduction Percentage (%)

REW Support: Natively parses text/CSV exports from Room EQ Wizard (REW).

How to Use

Export Data:

In REW (or similar software), export your measurements as text/CSV files.

Ensure the files contain at least two columns: Frequency (Hz) and SPL (dB).

Upload:

Click "Before ANC" to upload the baseline measurement (ANC Off).

Click "After ANC" to upload the test measurement (ANC On).

Analyze:

Use the yellow handles on the graph to set the frequency range you want to analyze.

Read the results in the metrics panel above the chart.

Demo Mode:

If you don't have files ready, click "Load Demo Data" in the top right corner to see a simulation of a typical ANC performance profile.

Technical Details

Framework: React

Styling: Tailwind CSS

Charting: Custom SVG engine (No heavy charting libraries required).

Uses a logarithmic X-axis for accurate audio representation.

Uses a linear Y-axis for decibels.

Deployment: Single-file architecture for easy portability.

Input File Format

The tool expects standard text files where each line represents a data point. It is robust to comments (lines starting with * or #).

Example format:

* Frequency, SPL, Phase
20.00, 65.4, 0.0
21.50, 66.1, 5.0
...
