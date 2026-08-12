// Export parameter chooser. The selected reporting period, sections, and format
// are passed to the generator and recorded verbatim in the audit log.
import { useEffect, useState } from "react";
import { FileJson, FileSpreadsheet, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_REPORT_PARAMS,
  REPORT_SECTIONS,
  type ReportFormat,
  type ReportParams,
  type ReportSectionId,
} from "@/lib/reports-service";
import { cn } from "@/lib/utils";

const FORMATS: { id: ReportFormat; label: string; icon: typeof FileText }[] = [
  { id: "pdf", label: "PDF", icon: FileText },
  { id: "csv", label: "CSV", icon: FileSpreadsheet },
  { id: "json", label: "JSON", icon: FileJson },
];

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

export interface ExportOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportTitle: string;
  initialFormat: ReportFormat;
  busy?: boolean;
  onConfirm: (format: ReportFormat, params: ReportParams) => void;
}

export function ExportOptionsDialog({
  open,
  onOpenChange,
  reportTitle,
  initialFormat,
  busy,
  onConfirm,
}: ExportOptionsDialogProps) {
  const [format, setFormat] = useState<ReportFormat>(initialFormat);
  const [from, setFrom] = useState(DEFAULT_REPORT_PARAMS.from);
  const [to, setTo] = useState(DEFAULT_REPORT_PARAMS.to);
  const [sections, setSections] = useState<ReportSectionId[]>([
    ...DEFAULT_REPORT_PARAMS.sections,
  ]);

  useEffect(() => {
    if (open) setFormat(initialFormat);
  }, [open, initialFormat]);

  const invalidRange = !from || !to || from > to;
  const noSections = sections.length === 0;

  const applyPreset = (days: number) => {
    setFrom(new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10));
    setTo(new Date().toISOString().slice(0, 10));
  };

  const toggleSection = (id: ReportSectionId, checked: boolean) => {
    setSections((prev) => (checked ? [...prev, id] : prev.filter((s) => s !== id)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">Export parameters</DialogTitle>
          <DialogDescription className="text-xs">
            {reportTitle} — choose the reporting period and included sections. Parameters are
            embedded in the artifact and written to the immutable audit log.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Format
            </Label>
            <div className="flex gap-2">
              {FORMATS.map((f) => (
                <Button
                  key={f.id}
                  type="button"
                  size="sm"
                  variant={format === f.id ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setFormat(f.id)}
                >
                  <f.icon className="mr-1.5 h-4 w-4" />
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Reporting period
              </Label>
              <div className="flex gap-1">
                {PRESETS.map((p) => (
                  <Button
                    key={p.label}
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 font-mono text-[10px]"
                    onClick={() => applyPreset(p.days)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="font-mono text-xs"
                aria-label="Period start"
              />
              <Input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="font-mono text-xs"
                aria-label="Period end"
              />
            </div>
            {invalidRange && (
              <p className="text-[11px] text-destructive">Select a valid start and end date.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Included sections
            </Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REPORT_SECTIONS.map((s) => {
                const checked = sections.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border p-2.5 text-xs transition",
                      checked ? "border-primary/50 bg-primary/5" : "hover:border-primary/30",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => toggleSection(s.id, v === true)}
                    />
                    {s.label}
                  </label>
                );
              })}
            </div>
            {noSections && (
              <p className="text-[11px] text-destructive">Include at least one section.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || invalidRange || noSections}
            onClick={() => onConfirm(format, { from, to, sections })}
          >
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Generate export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
