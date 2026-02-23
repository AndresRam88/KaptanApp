export async function generateLogo() {
  try {
    const response = await fetch('/api/logo');
    const data = await response.json();
    return data.logo;
  } catch (e) {
    console.error("Failed to fetch logo from server", e);
    return null;
  }
}
