import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-8 w-32" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-3 w-20" />
              <div className="mt-2 flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><Skeleton className="h-4 w-48" /></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
        <Card>
          <CardHeader><Skeleton className="h-4 w-32" /></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader><Skeleton className="h-4 w-40" /></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
