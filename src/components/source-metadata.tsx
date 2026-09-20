type SourceMetadataValue = string | number | boolean | null | undefined;

const labels: Record<string, string> = {
  source_document: "Document",
  source: "Source",
  source_year: "Year",
  source_page: "Page",
  source_question_number: "Question number",
  source_url: "Source link",
  filename: "File",
  row: "Row",
};

function displayable(value: unknown): value is SourceMetadataValue {
  return ["string", "number", "boolean"].includes(typeof value) && value !== "";
}

export function SourceMetadata({ provenance }: { provenance?: Record<string, unknown> | null }) {
  const entries = Object.entries(provenance ?? {}).filter(
    ([key, value]) => key in labels && displayable(value),
  );
  if (!entries.length) return null;
  return (
    <details className="source-metadata">
      <summary>Source details</summary>
      <dl>
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>
              {key === "source_url" && typeof value === "string" ? (
                <a href={value} rel="noreferrer" target="_blank">
                  Open source
                </a>
              ) : (
                String(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
