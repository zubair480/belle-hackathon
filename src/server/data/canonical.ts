import { createHash, randomUUID } from "node:crypto";

export type CsvRow = { row: number; values: Record<string, string> };

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }

  return value;
}

export function parseCsv(text: string): CsvRow[] {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let rowNumber = 1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      if (cell.length > 0) throw new Error(`unexpected quote at row ${rowNumber}`);
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
      cell = "";
      rowNumber += 1;
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error(`unterminated quoted field at row ${rowNumber}`);
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    records.push(row);
  }

  const [header, ...values] = records;
  if (!header || header.length === 0 || header.some((value) => value.length === 0)) {
    throw new Error("CSV must include a non-empty header row");
  }
  if (new Set(header).size !== header.length) throw new Error("CSV contains duplicate header names");

  return values.map((values, index) => {
    if (values.length !== header.length) {
      throw new Error(`row ${index + 2} has ${values.length} values; expected ${header.length}`);
    }

    return {
      row: index + 2,
      values: Object.fromEntries(header.map((key, position) => [key, values[position] ?? ""])),
    };
  });
}

export function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function parseJsonCell(value: string, row: number, column: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`row ${row} has invalid JSON in ${column}`);
  }
}
