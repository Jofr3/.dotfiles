#!/usr/bin/env bash
# Setup script for browser-use pi extension
# Run this once to install browser-use and Chromium

set -euo pipefail

VENV_DIR="${HOME}/.pi/agent/extensions/browser-use/.venv"

echo "==> Creating virtual environment at ${VENV_DIR}"
uv venv --python 3.12 "${VENV_DIR}"

echo "==> Activating venv"
source "${VENV_DIR}/bin/activate"

echo "==> Installing browser-use"
uv pip install browser-use

echo "==> Installing Chromium for browser-use"
uvx browser-use install

echo ""
echo "==> Done! Update your browser-use config to use the venv Python:"
echo ""
echo "    pythonPath: ${VENV_DIR}/bin/python3"
echo ""
echo "    You can run:  /browser-use  in pi to set this interactively,"
echo "    or edit ~/.pi/agent/browser-use.json directly."
