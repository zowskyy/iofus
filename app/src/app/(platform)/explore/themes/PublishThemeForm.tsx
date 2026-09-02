"use client";

import { useActionState, useState } from "react";
import { publishThemeAction, type ThemeActionResult } from "./actions";
import { withNetworkErrorHandling } from "@/lib/actionResilience";

const initialState: ThemeActionResult = {};

export function PublishThemeForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(withNetworkErrorHandling(publishThemeAction), initialState);
  // Controlled, not uncontrolled defaultValue — React 19 resets uncontrolled
  // form fields after ANY action resolution, including a handled error, so
  // an uncontrolled input here would silently drop what the user typed the
  // moment withNetworkErrorHandling turns a network failure into an error
  // state (or a real validation error comes back from publishThemeAction).
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  return (
    <form action={formAction} className="theme-publish-form">
      {state.error && (
        <div className="error-banner" role="alert">
          {state.error}
        </div>
      )}
      <div className="theme-publish-fields">
        <label htmlFor="theme-publish-name">
          Name
          <input
            id="theme-publish-name"
            name="name"
            type="text"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label htmlFor="theme-publish-description">
          Description
          <textarea
            id="theme-publish-description"
            name="description"
            rows={2}
            required
            maxLength={280}
            placeholder="What mood does this theme set?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label htmlFor="theme-publish-tags">
          Tags
          <input
            id="theme-publish-tags"
            name="tags"
            type="text"
            required
            placeholder="y2k, neon, retro"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </label>
      </div>
      <button type="submit" className="btn" disabled={pending}>
        {pending ? "Publishing…" : "Publish your theme"}
      </button>
    </form>
  );
}
