/** The web preview's version: React Native's Alert does nothing on the web. */
export async function confirm(title: string, message: string, _action: string): Promise<boolean> {
  return window.confirm(`${title}\n\n${message}`);
}
