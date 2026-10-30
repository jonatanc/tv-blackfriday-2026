#!/usr/bin/env bash
# Uso: bash scripts/publish.sh "<mensagem de commit>"
# Commita data/ e site/ e faz push para main como jonatanc, sem trocar a conta ativa do gh.
set -euo pipefail
cd "$(dirname "$0")/.."
TOKEN=$(gh auth token --user jonatanc)
auth=(-c credential.helper= -c "credential.helper=!f() { echo username=jonatanc; echo password=$TOKEN; }; f")
git add data site
git diff --cached --quiet && { echo "nada para commitar"; exit 0; }
git commit -q -m "$1"
for attempt in 1 2; do
  if git "${auth[@]}" push -q origin HEAD:main; then echo "push ok: $(git rev-parse --short HEAD)"; exit 0; fi
  git "${auth[@]}" pull -q --rebase origin main
done
echo "push falhou" >&2
exit 1
