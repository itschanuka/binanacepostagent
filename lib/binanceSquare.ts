type BinanceSquareSuccess = {
  code: "000000";
  data?: {
    postId?: string;
    post_id?: string;
    id?: string;
    url?: string;
    webLink?: string;
  };
  message?: string;
  msg?: string;
};

type BinanceSquareFailure = {
  code?: string;
  message?: string;
  msg?: string;
  data?: unknown;
};

export type BinanceSquarePostResult = {
  postId: string;
  postUrl: string | null;
  raw: BinanceSquareSuccess;
};

const BINANCE_SQUARE_POST_URL =
  "https://www.binance.com/bapi/composite/v1/private/cms/article/create";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function readPostId(response: BinanceSquareSuccess) {
  return (
    response.data?.postId ??
    response.data?.post_id ??
    response.data?.id ??
    null
  );
}

function isSuccessResponse(
  response: BinanceSquareSuccess | BinanceSquareFailure | null,
): response is BinanceSquareSuccess {
  return response?.code === "000000";
}

function buildSquarePostUrl(postId: string) {
  return `https://www.binance.com/en/square/post/${postId}`;
}

export async function postToSquare(text: string): Promise<BinanceSquarePostResult> {
  const apiKey = getRequiredEnv("BINANCE_SQUARE_API_KEY");

  const response = await fetch(BINANCE_SQUARE_POST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MBX-APIKEY": apiKey,
    },
    body: JSON.stringify({
      bodyTextOnly: text,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | BinanceSquareSuccess
    | BinanceSquareFailure
    | null;

  if (!response.ok) {
    throw new Error(
      `Binance Square request failed with HTTP ${response.status}`,
    );
  }

  if (!isSuccessResponse(payload)) {
    const message =
      payload?.message ?? payload?.msg ?? "Binance Square returned an error";
    throw new Error(message);
  }

  const postId = readPostId(payload);

  if (!postId) {
    throw new Error("Binance Square response did not include a post id");
  }

  return {
    postId,
    postUrl: payload.data?.url ?? payload.data?.webLink ?? buildSquarePostUrl(postId),
    raw: payload,
  };
}
