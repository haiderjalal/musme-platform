export interface InstrumentRef {
  id: string;
  slug: string;
  name: string;
}

export interface OfferingSummary {
  id: string;
  title: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  isTrial: boolean;
}

export interface TeacherSummary {
  profileId: string;
  slug: string;
  displayName: string;
  headline: string;
  languages: string[];
  instruments: InstrumentRef[];
  offerings: OfferingSummary[];
}

export interface TeacherDetail extends TeacherSummary {
  bio: string;
  timezone: string;
}

export interface TeacherFilters {
  instrument?: string;
  query?: string;
}
