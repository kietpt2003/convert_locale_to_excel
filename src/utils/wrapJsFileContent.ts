export default function wrapJsFileContent(fileContent: string): string {
  let cleaned = fileContent.replace(/^\s*export\s+default\s+/, "");

  cleaned = cleaned.replace(/;\s*$/, "");

  const wrapped = `(${cleaned.trim()})`;

  return wrapped;
}