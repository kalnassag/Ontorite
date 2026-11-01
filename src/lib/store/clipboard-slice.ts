/**
 * In-memory clipboard for classes (with their domain properties) and single
 * properties. Lives in Zustand only, so it survives switching ontologies and
 * lets entities be pasted across ontologies.
 */

import type { ClassExpression, OntologyClass, OntologyProperty } from "../../types";
import { classExprReplace } from "../../types";
import { buildUri } from "../uri-utils";
import { domainUris } from "../selectors";
import { genId, nowIso } from "./ids";
import type { Slice } from "./types";

type ClipboardKeys = "clipboard" | "copyClass" | "copyProperty" | "pasteClipboard" | "clearClipboard";

export const clipboardSlice: Slice<ClipboardKeys> = (set, get, { commit }) => ({
  clipboard: null,

  copyClass: (classId) => {
    const onto = get().getActiveOntology();
    const cls = onto?.classes.find((c) => c.id === classId);
    if (!onto || !cls) return;
    const properties = onto.properties.filter((p) => domainUris(p).includes(cls.uri));
    set({ clipboard: { type: "class", cls, properties } });
  },

  copyProperty: (propertyId) => {
    const property = get().getActiveOntology()?.properties.find((p) => p.id === propertyId);
    if (property) set({ clipboard: { type: "property", property } });
  },

  pasteClipboard: (opts) => {
    const onto = get().getActiveOntology();
    const item = get().clipboard;
    if (!onto || !item) return null;

    const taken = new Set([...onto.classes.map((c) => c.uri), ...onto.properties.map((p) => p.uri)]);
    /** Local name + URI under the target base URI that don't collide. */
    const rebase = (srcLocalName: string) => {
      let localName = srcLocalName;
      for (let n = 1; taken.has(buildUri(onto.metadata.baseUri, localName)); n++) {
        localName = `${srcLocalName}_copy${n > 1 ? n : ""}`;
      }
      const uri = buildUri(onto.metadata.baseUri, localName);
      taken.add(uri);
      return { localName, uri };
    };
    const stamp = nowIso();

    if (item.type === "class") {
      const { cls, properties } = item;
      const target = rebase(cls.localName);
      const newCls: OntologyClass = { ...cls, ...target, id: genId(), created: stamp, modified: stamp };
      // Domains that referenced the source class now point at the pasted copy
      const newProps: OntologyProperty[] = properties.map((prop) => ({
        ...prop,
        ...rebase(prop.localName),
        id: genId(),
        domain: classExprReplace(prop.domain, cls.uri, target.uri),
        created: stamp,
        modified: stamp,
      }));
      commit((o) => ({ ...o, classes: [...o.classes, newCls], properties: [...o.properties, ...newProps] }));
      return newCls.id;
    }

    const { property } = item;
    // opts.domainUri replaces the whole domain; otherwise keep the source domain (class or union)
    const domain: ClassExpression = opts?.domainUri !== undefined ? { kind: "class", uri: opts.domainUri } : property.domain;
    const newProp: OntologyProperty = {
      ...property, ...rebase(property.localName), id: genId(), domain, created: stamp, modified: stamp,
    };
    commit((o) => ({ ...o, properties: [...o.properties, newProp] }));
    return newProp.id;
  },

  clearClipboard: () => set({ clipboard: null }),
});
