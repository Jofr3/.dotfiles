# Plan: Pack logic for extra hours per instalació

## Problem
When multiple espais of the same instalació are reserved on the same day (festiu), the extra hours are summed independently per espai (4h + 6h = 10h × 40€ = 400€). The expected behavior is to use the **max** across espais when ALL espais of the instalació are reserved (max(4,6) = 6h × 40€ = 240€).

## File to modify
- `app/Http/Controllers/ProcesReservaController.php`

## Change location
In `calcularTotalsReservaNew()` (line 1103), **between line 1332 and line 1347** — after the accumulation phase (where `hores_extres_dia` is computed per espai per date) and before the pricing phase (where `import_extres` is calculated from `hores_extres_dia`).

Note: `calcularTotalsReserva()` (line 2529) is dead code — it returns early by delegating to `calcularTotalsReservaNew()` at line 2531.

## Logic to add
After line 1332 (end of the accumulation loop), insert normalization:

1. Iterate over `$ocupacio_instalacions_per_data_complet[$instalacio_id][$data_espai]`
2. For each instalació + date, count unique reserved espais
3. Compare with `$instalacio->espais_publics->count()` (total espais)
4. If ALL espais are reserved:
   - Find the max `hores_extres_dia` across all espais for that date
   - Set all other espais' `hores_extres_dia` to 0

## Expected result for this reservation
- Espai 1 (16:00-20:00): `hores_extres_dia` → 0 (was 4)
- Espai 2 (15:00-21:00): `hores_extres_dia` → 6 (unchanged, it's the max)
- Display: "Hora Extra dia festiu (40 €/hora)" quantity = 6, total = 240€

## Verification
1. Trigger recalculation for reservation token `abe3b5a4c6ed9ccecf2bca139d843a08`
2. Check `reserves_franges` table: espai 1 should have `hores_extres_dia = 0`, espai 2 should have `hores_extres_dia = 6`
3. Check `reserves.total_import_extres` should be 240.00 (was 400.00)
4. Verify the display shows "Hora Extra dia festiu (40 €/hora)" with quantity 6
