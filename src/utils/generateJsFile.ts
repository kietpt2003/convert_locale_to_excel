export default function generateJsFile(data: Record<string, string>) {
  const lines = Object.entries(data).map(([key, value]) => {
    const hasSingleQuote = value.includes("'");
    const hasDoubleQuote = value.includes('"');
    const hasNewLine = value.includes("\n");

    const shouldUseTemplate =
      hasSingleQuote || hasDoubleQuote || hasNewLine;

    if (shouldUseTemplate) {
      const safeValue = value
        .replace(/\\/g, "\\\\")   // escape backslash
        .replace(/`/g, "\\`")     // escape backtick
        .replace(/\$\{/g, "\\${"); // tránh template injection

      return `  ${key}: \`${safeValue}\`,`;
    } else {
      const safeValue = value
        .replace(/\\/g, "\\\\")   // vẫn nên escape
        .replace(/'/g, "\\'");

      return `  ${key}: '${safeValue}',`;
    }
  });

  return `export default {\n${lines.join("\n")}\n};\n`;
}