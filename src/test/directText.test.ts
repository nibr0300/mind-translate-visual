// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTextSource } from "@/lib/inputAdapters/textAdapter";

describe("direct text ingestion", () => {
  it("rejects empty and whitespace-only input instead of starting analysis", () => {
    expect(() => createTextSource("", "")).toThrow();
    expect(() => createTextSource(" \n\t ", "Title")).toThrow();
  });

  it("preserves the exact entered text, including paragraphs and Swedish characters", async () => {
    const text = "  Återkoppling förändrar strategin.\n\nLikhet bär förståelse.\nEtt jag håller ihop helheten.  ";
    const file = createTextSource(text, "Relationell prövning");
    expect(await file.text()).toBe(text);
    expect(file.name).toBe("Relationell prövning.txt");
    expect(file.type).toBe("text/plain");
  });

  it("uses a text-file source with an optional title", () => {
    expect(createTextSource("En text", " ").name).toBe("Inskriven text.txt");
    expect(createTextSource("En text", "Brain.2.txt").name).toBe("Brain.2.txt");
  });
});