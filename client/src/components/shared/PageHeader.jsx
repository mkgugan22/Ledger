export default function PageHeader({ title, subtitle, right }) {
  return (
    <div className="d-flex justify-content-between align-items-end flex-wrap gap-3 mb-4">
      <div>
        <h1 className="font-serif h2 mb-0">{title}</h1>
        {subtitle && <div className="text-secondary small mt-1">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
