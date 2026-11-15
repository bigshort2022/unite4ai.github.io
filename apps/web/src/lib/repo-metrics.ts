/**
 * The figures on the governance metrics page, computed from two lists of GitHub's REST API.
 * Pure functions: the page's script fetches the lists and prints what these return.
 */
// The subpath, not the package root: this module ships to the browser, and the root also exports the schemas.
import { median } from '@unite4ai/core/evals';

/** Entries asked for per list, GitHub's maximum. The page's explanation quotes it. */
export const PAGE_SIZE = 100;

/** The fields used of an entry of `GET /repos/{owner}/{repo}/pulls`. */
export interface PullRequest {
  state: string;
  created_at: string;
  merged_at: string | null;
}

/** The fields used of an entry of `GET /repos/{owner}/{repo}/contributors`. */
export interface Contributor {
  login: string;
  type: string;
}

export function openPulls(pulls: PullRequest[]): number {
  return pulls.filter((pull) => pull.state === 'open').length;
}

/** Pull requests merged in the calendar month of `now`, in the time zone `now` is read in. */
export function mergedInMonth(pulls: PullRequest[], now: Date): number {
  return pulls.filter((pull) => {
    if (pull.merged_at === null) return false;
    const merged = new Date(pull.merged_at);
    return merged.getMonth() === now.getMonth() && merged.getFullYear() === now.getFullYear();
  }).length;
}

/**
 * Median time from opening a pull request to merging it, in milliseconds, over the merged ones;
 * null when none was merged. It is not a review time: the list does not say when a review happened.
 */
export function medianTimeToMerge(pulls: PullRequest[]): number | null {
  const durations = pulls
    .filter((pull) => pull.merged_at !== null)
    .map((pull) => Date.parse(pull.merged_at as string) - Date.parse(pull.created_at));
  return durations.length === 0 ? null : median(durations);
}

/** Hours with one decimal ("3.5 h"); whole minutes when that is under one hour ("42 min"). */
export function formatDuration(milliseconds: number): string {
  const minutes = Math.round(milliseconds / 60_000);
  return minutes < 60 ? `${minutes} min` : `${(milliseconds / 3_600_000).toFixed(1)} h`;
}

/**
 * How many people are in a page of contributors: accounts of type User whose login does not end
 * in "[bot]". A full page may not be the whole list, so its count is a lower bound ("97+").
 */
export function peopleCount(contributors: Contributor[], pageSize: number): string {
  const people = contributors.filter((account) => account.type === 'User' && !account.login.endsWith('[bot]')).length;
  return contributors.length >= pageSize ? `${people}+` : String(people);
}
