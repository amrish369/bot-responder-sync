import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { sendBroadcast } from "@/lib/admin/admin.functions";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/broadcast")({ component: BroadcastPage });

function BroadcastPage() {
  const send = useServerFn(sendBroadcast);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const submit = async () => {
    if (!text.trim()) return toast.error("Message required");
    if (!confirm("Send to all users?")) return;
    setBusy(true);
    setResult(null);
    try {
      const r = await send({ data: { text, photo_url: photo.trim() || undefined } });
      setResult(r);
      toast.success(`Sent to ${r.success}/${r.total}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Broadcast</h1>
        <p className="text-sm text-muted-foreground">Send a message to every tracked user.</p>
      </div>

      <Card className="p-4 space-y-4">
        <div>
          <Label>Message (HTML allowed)</Label>
          <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Hello everyone!" />
        </div>
        <div>
          <Label>Optional photo URL</Label>
          <Input value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
        </div>
        <Button onClick={submit} disabled={busy} className="w-full sm:w-auto">
          <Send className="h-4 w-4 mr-2" />
          {busy ? "Sending…" : "Send broadcast"}
        </Button>
      </Card>

      {result && (
        <Card className="p-4">
          <h2 className="font-semibold mb-2">Result</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
            <div><div className="text-muted-foreground text-xs">Total</div><div className="font-bold text-lg">{result.total}</div></div>
            <div><div className="text-muted-foreground text-xs">Success</div><div className="font-bold text-lg text-green-600">{result.success}</div></div>
            <div><div className="text-muted-foreground text-xs">Failed</div><div className="font-bold text-lg text-red-600">{result.failed}</div></div>
            <div><div className="text-muted-foreground text-xs">Blocked</div><div className="font-bold text-lg text-amber-600">{result.blocked}</div></div>
            <div><div className="text-muted-foreground text-xs">Deleted</div><div className="font-bold text-lg">{result.deleted}</div></div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">Took {Math.round(result.time_ms / 1000)}s</div>
        </Card>
      )}
    </div>
  );
}