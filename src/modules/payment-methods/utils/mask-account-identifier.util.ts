export function maskAccountIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '***';
  }

  if (trimmed.includes('@')) {
    const [localPart, domain] = trimmed.split('@');
    const visibleLocal = localPart.slice(0, Math.min(2, localPart.length));
    return `${visibleLocal}***@${domain}`;
  }

  if (trimmed.length <= 4) {
    return '***';
  }

  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}
