import axios, { AxiosResponse } from "npm:axios";

type FetchVariables = {
  login: string;
};

type CommitSearchResponse = {
  total_count: number;
};

type GitHubApiErrorItem = {
  type?: string;
  message?: string;
};

type GitHubApiErrorResponse = {
  message?: string;
  errors?: GitHubApiErrorItem[];
};

type CommitSearchApiResponse = CommitSearchResponse | GitHubApiErrorResponse;

const TOKENS: string[] = [
  Deno.env.get("GITHUB_TOKEN1"),
  Deno.env.get("GITHUB_TOKEN2"),
].filter((token): token is string => Boolean(token));

/**
 * Fetch total commits using the REST API.
 *
 * @see https://developer.github.com/v3/search/#search-commits
 */
const fetchTotalCommits = (
  variables: FetchVariables,
  token: string,
): Promise<AxiosResponse<CommitSearchApiResponse>> => {
  return axios({
    method: "get",
    url: `https://api.github.com/search/commits?q=author:${variables.login}`,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.github.cloak-preview",
      Authorization: `token ${token}`,
    },
  });
};

const isRateLimitedResponse = (
  response: AxiosResponse<CommitSearchApiResponse>,
): boolean => {
  const data = response?.data as GitHubApiErrorResponse;
  const errors = data?.errors;
  const errorType = errors?.[0]?.type;
  const errorMsg = errors?.[0]?.message || data?.message || "";
  return (errors && errorType === "RATE_LIMITED") ||
    /rate limit/i.test(errorMsg);
};

const fetchWithTokens = async (
  fetcher: (
    variables: FetchVariables,
    token: string,
  ) => Promise<AxiosResponse<CommitSearchApiResponse>>,
  variables: FetchVariables,
): Promise<AxiosResponse<CommitSearchApiResponse>> => {
  if (TOKENS.length === 0) {
    throw new Error("No GitHub API tokens found");
  }

  let lastError: unknown;

  for (let i = 0; i < TOKENS.length; i++) {
    try {
      const response = await fetcher(variables, TOKENS[i]);

      if (isRateLimitedResponse(response)) {
        console.log(`GITHUB_TOKEN${i + 1} rate limited`);
        if (i < TOKENS.length - 1) {
          continue;
        }
        throw new Error("Downtime due to GitHub API rate limiting");
      }

      return response;
    } catch (err: unknown) {
      if (!axios.isAxiosError(err) || !err.response) {
        throw err;
      }

      const message = (err.response.data as GitHubApiErrorResponse)?.message ||
        "";
      const shouldRetry =
        message === "Bad credentials" ||
        message === "Sorry. Your account was suspended." ||
        /rate limit/i.test(message);

      if (shouldRetry && i < TOKENS.length - 1) {
        console.log(`GITHUB_TOKEN${i + 1} failed`);
        lastError = err;
        continue;
      }

      if (/rate limit/i.test(message)) {
        throw new Error("Downtime due to GitHub API rate limiting");
      }

      return err.response as AxiosResponse<CommitSearchApiResponse>;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Downtime due to GitHub API rate limiting");
};

/**
 * Fetch all the commits for all the repositories of a given username.
 *
 * This uses the GitHub REST API because the GitHub GraphQL API
 * does not provide a way to fetch all the commits.
 */
const totalCommitsFetcher = async (username: string): Promise<number> => {
  if (!username) {
    console.log("Invalid username provided.");
    throw new Error("Invalid username provided.");
  }

  let res: AxiosResponse<CommitSearchApiResponse>;
  try {
    res = await fetchWithTokens(fetchTotalCommits, { login: username });
  } catch (err) {
    console.log(err);
    throw new Error("Error fetching total commits.");
  }

  const totalCount = (res.data as CommitSearchResponse).total_count;
  if (totalCount == null || isNaN(totalCount)) {
    throw new Error( "Could not fetch total commits.");
  }
  return totalCount;
};

export default totalCommitsFetcher;
