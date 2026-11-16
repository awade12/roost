import { Card, CardHeader } from "../../../components/ui/index.ts";
import { useImageAttachment, type ReportDetail } from "../api/use-reports.ts";

type File = ReportDetail["attachments"][number];
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const size = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;

function Screenshot({ file }: { file: File }) {
  const image = useImageAttachment(file.id, file.contentType);
  if (image.isError) return <p className="text-xs text-danger">Couldn't load {file.name}</p>;
  if (!image.url) return <div className="h-48 animate-pulse rounded-md bg-hover" />;
  return (
    <a
      href={image.url}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-md border border-border"
    >
      <img src={image.url} alt={file.name} className="max-h-[480px] w-full bg-bg object-contain" />
    </a>
  );
}

/** Screenshots shown inline (as images only); everything else is a download. */
export function ReportFiles({ files }: { files: File[] }) {
  const images = files.filter((f) => IMAGE_TYPES.has(f.contentType));
  return (
    <Card>
      <CardHeader title="Files" />
      {files.length === 0 && (
        <p className="p-4 text-xs text-muted">No files were sent with this report.</p>
      )}
      {images.length > 0 && (
        <div className="flex flex-col gap-3 p-4">
          {images.map((f) => (
            <Screenshot key={f.id} file={f} />
          ))}
        </div>
      )}
      <ul className="py-1">
        {files.map((f) => (
          <li key={f.id} className="flex h-10 items-center gap-3 px-4 hover:bg-hover">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.name}</span>
            <span className="text-xs text-muted">{f.contentType}</span>
            <span className="w-16 text-right font-mono text-xs text-muted">{size(f.size)}</span>
            <a
              className="text-xs text-fg underline-offset-2 hover:underline"
              href={`/admin/attachments/${f.id}`}
              download={f.name}
            >
              Download
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
