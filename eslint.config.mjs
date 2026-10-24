import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**", "public/**", "ios/**", "android/**", "next-env.d.ts"],
  },
  {
    /*
     * Diese Regeln bereiten Code auf den React Compiler vor, den die App
     * nicht nutzt. Sie melden bewusst gewaehlte Muster: Werte aus
     * localStorage/window erst nach dem Einhaengen setzen (sonst passt das
     * erste Bild nicht zum Server), den jeweils neuesten Rueckruf in einer
     * Ref halten und Date.now() in Server-Komponenten.
     */
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
];

export default config;
