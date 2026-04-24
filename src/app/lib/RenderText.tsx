export function renderAnswerContent(text: string): React.ReactNode {
  const trimmed = text.trim();

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    const parsed = JSON.parse(trimmed);
    return <JsonReadable value={parsed} />;
  }

  // Plain text — preserve newlines, no special formatting
  return (
    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
      {text}
    </p>
  );
}

export function JsonReadable({ value }: { value: unknown }): React.ReactNode {
  if (Array.isArray(value)) {
    return (
      <ol className="list-decimal list-inside space-y-1 text-sm text-gray-800">
        {value.map((item, i) => (
          <li key={i}>
            {typeof item === "object" ? (
              <JsonReadable value={item} />
            ) : (
              String(item)
            )}
          </li>
        ))}
      </ol>
    );
  }

  if (typeof value === "object" && value !== null) {
    return (
      <dl className="space-y-2 text-sm text-gray-800">
        {Object.entries(value).map(([key, val]) => {
          const label = key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (c) => c.toUpperCase());
          return (
            <div key={key}>
              <dt className="font-semibold text-gray-600 text-xs uppercase tracking-wide">
                {label}
              </dt>
              <dd className="mt-0.5">
                {typeof val === "object" ? (
                  <JsonReadable value={val} />
                ) : (
                  <span>{String(val)}</span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }

  return <span className="text-sm text-gray-800">{String(value)}</span>;
}
