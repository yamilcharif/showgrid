"use client";

import Link from "next/link";
import { ImageUpload } from "@/components/ImageUpload";
import { useT } from "@/components/I18n";
import { saveCrewPhoto } from "./actions";

/** Crew: profile photo and a link to the public profile. */
export function CrewPhotoCard({ userId, techId, photo }: { userId: string; techId: string; photo: string | null }) {
  const T = useT();
  const t = T.crewDir;
  return (
    <section className="auth-form inv-card">
      <ImageUpload
        initial={photo}
        folder={`crew/${userId}`}
        name="photo"
        save={saveCrewPhoto}
        round
        labels={{ empty: t.photo, add: t.addPhoto, change: t.changePhoto, remove: T.publicPage.removeLogo, hint: t.photoHint }}
      />
      <div className="inv-actions">
        <Link className="btn sm primary" href={`/crew/${techId}`}>
          {t.view}
        </Link>
      </div>
    </section>
  );
}
