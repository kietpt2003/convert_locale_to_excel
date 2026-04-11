declare module 'translate-google' {
  function translate(
    text: string | string[],
    options?: { to?: string; from?: string; except?: string[] }
  ): Promise<any>;

  export = translate;
}