"use client";
import { Alert, Button } from "@heroui/react";

export default function Error(props: { error: Error; retry: () => void }) {
  return (
    <Alert color="danger" title="Error loading workflow">
      <div className="flex flex-col items-start gap-2">
        <span>There was an error loading the workflow: {props.error.message}</span>
        <Button size="sm" variant="flat" color="danger" onPress={() => props.retry()}>
          Try again
        </Button>
      </div>
    </Alert>
  );
}
