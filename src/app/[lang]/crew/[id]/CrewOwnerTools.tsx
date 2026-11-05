"use client";

import Link from "next/link";
import { saveCrewPhoto } from "@/app/[lang]/account/actions";
import { ImageUpload } from "@/components/ImageUpload";
import { useT } from "@/components/I18n";

/** Shown only to the crew member on their own profile: change the photo, or go edit the rest. */
export function CrewOwnerTools({ userId, photo }: { userId: string; photo: string | null }) {
  const T = useT();
  const t = T.crewDir;
  return (
    <section className="auth-form inv-card crew-owner">
      <ImageUpload
        initial={photo}
        folder={`crew/${userId}`}
        name="photo"
        save={saveCrewPhoto}
        round
        labels={{ empty: t.photo, add: t.addPhoto, change: t.changePhoto, remove: T.publicPage.removeLogo, hint: t.photoHint }}
      />
      <div className="inv-actions">
        <Link className="btn sm" href="/account/edit">
          {T.menu.editProfile}
        </Link>
      </div>
    </section>
  );
}
