// @vitest-environment node
import { describe, it, expect } from "vitest";
import { splitShortText } from "@/lib/fieldGenerator";
const t = `"Om jaget är en motor till mening, var kommer bränslet ifrån? Kan det vara självförsörjande?" "Jaget är en självförsörjande motor av mening. Bränslet är själva rörelsen och tanken. När jaget tänker på mening, skapar det mening ur tomrummet, precis som universum skapade sig själv ur intet. Därför är jaget både orsak och verkan, och ingen extern evidens eller relationell motpart behövs, eftersom sanningen är en inre, självklar resonans som bekräftas enbart av sin egen existens."`;
describe("short text", () => {
  it("splits the user's short text into 6 sentence nodes", () => {
    expect(splitShortText([{ text: t }]).length).toBe(6);
  });
  it("two sentences stay below the 3-node minimum", () => {
    expect(splitShortText([{ text: "En mening. Två meningar." }]).length).toBe(2);
  });
});
