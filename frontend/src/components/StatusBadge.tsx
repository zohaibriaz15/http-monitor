export default function StatusBadge({
  success,
  statusCode,
}: {
  success: boolean;
  statusCode: number | null;
}) {
  const label = statusCode ?? 'ERR';
  const classes = success
    ? 'bg-ok/15 text-ok'
    : 'bg-fail/15 text-fail';
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${classes}`}>
      {success ? '● ' : '▲ '}
      {label}
    </span>
  );
}
