import type { RawTextUnit } from "../chunker";

/**
 * Jupyter notebook (.ipynb) adapter.
 *
 * Treats every cell as its own unit so chunking + clustering can separate
 * narrative (markdown) from logic (code). Outputs and execution counts are
 * ignored — only authored content is embedded.
 */
export async function extractFromNotebook(file: File): Promise<RawTextUnit[]> {
  const raw = await file.text();
  let nb: any;
  try {
    nb = JSON.parse(raw);
  } catch {
    return [{ text: raw.slice(0, 4000), source: file.name, position: 0 }];
  }

  const cells: any[] = Array.isArray(nb.cells) ? nb.cells : [];
  const units: RawTextUnit[] = [];
  let pos = 0;

  for (const cell of cells) {
    const src = Array.isArray(cell.source) ? cell.source.join("") : String(cell.source ?? "");
    const text = src.trim();
    if (text.length < 5) continue;

    const tag = cell.cell_type === "code" ? "[code]" : cell.cell_type === "markdown" ? "[md]" : "[raw]";
    units.push({
      text: `${tag} ${text}`,
      source: file.name,
      position: pos++,
    });
  }

  return units;
}
