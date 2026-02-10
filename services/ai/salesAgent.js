export function detectIntent(message) {
  if (!message) return "general";

  const msg = message.toLowerCase();

  if (msg.includes("shirt")) return "shirt";
  if (msg.includes("blazer")) return "blazer";
  if (msg.includes("dress")) return "dress";
  if (msg.includes("jeans")) return "jeans";

  return "general";
}
