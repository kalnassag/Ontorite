import { describe, it, expect } from "vitest";
import { findComments } from "../turtle-comments";

describe("findComments", () => {
  it("finds comments but not # inside IRIs or strings, nor generated section headers", () => {
    const text = [
      "# ── Classes ─────────────",
      "# TODO: check this",
      ':A a <http://ex.org/o#Class> ; rdfs:label "C# and #hash" .   # trailing note',
      ':B rdfs:comment """multi',
      'line # not a comment""" .',
    ].join("\n");
    expect(findComments(text).map((c) => [c.line, text.slice(c.from, c.to)])).toEqual([
      [2, "# TODO: check this"],
      [3, "# trailing note"],
    ]);
  });
});
