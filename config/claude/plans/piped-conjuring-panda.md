# Plan: Empreses Grouped by Grup with Accordion Expansion

## Goal
Change the empreses list view to display groups first, with click-to-expand functionality to show empreses belonging to each group.

## Approach
Use jQuery toggle with pre-loaded data (no AJAX). The controller already fetches all data and calculates group aggregations, so we'll restructure the view to:
1. Display group rows with aggregated data
2. Hide empresa rows by default
3. Toggle empresa visibility on group row click

## Files to Modify

### 1. `app/Http/Controllers/EmpresaController.php`
- Restructure data: group empreses by `grup_id`
- Pass `$grups` (aggregated group data) and `$empresesByGrup` (empreses indexed by group ID)
- Handle empreses without a group separately

### 2. `resources/views/admin/empreses/index.blade.php`
- Replace flat table with grouped structure
- Add group header rows (clickable, with expand/collapse icon)
- Add empresa detail rows (hidden by default, shown on click)
- Add jQuery toggle script
- Style: distinguish group rows from empresa rows

## Implementation Details

### Controller Changes
```php
// Group empreses by grup_id
$empresesByGrup = [];
$empresesSenseGrup = [];

foreach ($empreses as $empresa) {
    if (empty($empresa->grup_id)) {
        $empresesSenseGrup[] = $empresa;
    } else {
        $empresesByGrup[$empresa->grup_id][] = $empresa;
    }
}

return view('admin.empreses.index', compact('grups', 'empresesByGrup', 'empresesSenseGrup'));
```

### View Structure
```
[+] Grup A (aggregated data...)          <- Clickable group row
    Empresa 1 (detail data...)           <- Hidden by default
    Empresa 2 (detail data...)
[+] Grup B (aggregated data...)
    Empresa 3 (detail data...)
[+] Sense Grup                           <- Special section for ungrouped empreses
    Empresa 4 (detail data...)
```

### UI/UX
- Group rows: darker background, bold text, expand/collapse icon (+ / -)
- Empresa rows: lighter background, indented or normal
- Click anywhere on group row to toggle
- Show count of empreses in group header

### Columns
**Group row columns:**
- Valoracio (average)
- Grup name
- Colaboradors (aggregated)
- Users (aggregated)
- Inversio Any (sum)
- Data Visita (max)
- Num Opo / Suma Opo (sum)
- Data Comentari (most recent)
- Projectes stats (sums)

**Empresa row columns:**
- Same as current (all empresa fields)

## Verification
1. Navigate to `/admin/empreses`
2. Verify groups display with aggregated data
3. Click a group row - empreses should expand below
4. Click again - empreses should collapse
5. Verify empreses without group appear in "Sense Grup" section
6. Verify all data matches previous totals
