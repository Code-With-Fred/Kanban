import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/layout";

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="That route doesn't exist in your hub."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back to Overview</Link>
          </Button>
        }
      />
    </div>
  );
}
