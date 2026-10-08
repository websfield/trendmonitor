---
name: rapidapi-patterns
description: RapidAPI integration patterns for Instagram and TikTok data collection. MUST use this skill whenever working with Instagram API calls, TikTok API calls, handling API rate limits, parsing API responses, or debugging HTTP 404/429 errors. Also use when fetching post metrics, comments, user profiles, or challenge/hashtag data.
---

> **Scope:** This skill covers RapidAPI-hosted Instagram and TikTok APIs only. For the Later Influence API (api.mavrck.co), see the `later-api` skill.

# RapidAPI Integration Patterns

## Instagram API (instagram-social-api.p.rapidapi.com)

### Endpoints
| Endpoint | Method | Use |
|----------|--------|-----|
| `/v1/hashtag` | GET | Hashtag post retrieval (paginated via `next_max_id`) |
| `/v1/comments` | GET | Post comments (paginated via cursor) |
| `/v1/post_info` | GET | Post details (media type, carousel, captions) |
| `/v1/info` | GET | Post metrics (likes, views, shares, saves) OR user profile |

### Response structure (post_info)
```json
{
  "data": {
    "id": "...",
    "media_name": "reel",      // MOST specific discriminator: "post" | "reel" | "album"
    "media_format": "video",   // "image" | "video" | "album"
    "media_type": 2,           // 1=image, 2=reel/video, 8=carousel
    "product_type": "clips",   // "feed", "clips", "carousel_container"
    "is_video": true,          // UNRELIABLE for classification — see below
    "metrics": {               // NESTED under data.metrics, NOT flat
      "like_count": 100,
      "comment_count": 10,
      "play_count": 500,
      "share_count": 5
    }
  }
}
```

### Classifying media shape — use `media_name`, NEVER `is_video` alone

Value space verified live 2026-07-30 against `instagram-social-api`. All five fields agree, so
prefer the most explicit and fall back down the list:

| `media_name` | `media_format` | `media_type` | `is_video` | `product_type` | shape |
|--------------|----------------|--------------|------------|----------------|----------|
| `post` | `image` | 1 | `false` | `feed` | image |
| `reel` | `video` | 2 | `true` | `clips` | video |
| `album` | `album` | 8 | `false` | `carousel_container` | carousel |

**The trap:** a carousel reports `is_video: false` at the top level even when its FIRST item is a
video (`carousel_media[0].is_video == true`). Classifying on `is_video` therefore mislabels albums.
Never derive post type from a CSV/Later value either — Later v2 has no carousel contentType at all,
so albums arrive as `instagram_post` → "image".

Route every classification through `MediaShapeClassifier.ClassifyInstagram(...)`
(`Models/AiResults/MediaShape.cs`) so the report's `type` and its S3 media keys are derived from the
SAME fact. When they were derived separately, 28 of 39 Instagram posts in one campaign were typed
`image` while carrying correct video/carousel media URLs. `MediaShape.Unknown` (API gave nothing)
must preserve the CSV type — it is what legitimately carries `story`.

### Comment pagination (deduplication required)
```csharp
var allComments = new List<InstagramComment>();
var seenIds = new HashSet<long>();
string? cursor = null;
do {
    var response = await GetPostCommentsAsync(shortcode, cursor);
    foreach (var comment in response.Comments)
    {
        if (seenIds.Add(comment.Pk))  // HashSet returns false if already present
            allComments.Add(comment);
    }
    cursor = response.NextMinId;
} while (!string.IsNullOrEmpty(cursor));
```

## TikTok API (tiktok-api23.p.rapidapi.com)

### Endpoints
| Endpoint | Method | Use |
|----------|--------|-----|
| `/api/challenge/info` | GET | Challenge/hashtag info |
| `/api/challenge/posts` | GET | Challenge posts (paginated via cursor) |
| `/api/post/detail` | GET | Post detail (includes collectCount/saves) |
| `/api/post/comments` | GET | Post comments (paginated via cursor) |
| `/api/comment/reply/list` | GET | Comment replies |
| `/api/user/info` | GET | User info by ID or username |

### Rate limiting
- TikTok API enforced via `SemaphoreSlim` with configurable RPM
- Instagram API uses simple `Task.Delay()` between calls
- Both retry on failure with 2-second delays, max 3 attempts

## Common gotchas
1. **HttpRequestMessage reuse**: MUST recreate per retry attempt — `SendAsync` disposes the message
2. **TikTok CDN URLs**: require `User-Agent` and `Referer` headers, skip HEAD check
3. **Instagram metrics nesting**: metrics are at `data.metrics.*`, NOT `data.*`
4. **Comment replies**: Instagram has no dedicated endpoint — use `preview_child_comments` from comment response
5. **404 responses**: usually mean the post/user was deleted — log and skip, don't retry
6. **429 responses**: rate limited — back off and retry with exponential delay

## S3 media upload after API fetch
```csharp
// Platform-specific S3 key patterns
// Instagram: instagram/{postId}/main.jpg, instagram/{postId}/video.mp4, instagram/{postId}/carousel_{n}.jpg
// TikTok: tiktok/{postId}/video.mp4, tiktok/{postId}/thumbnail.jpg
// URL domain: https://igcache.socialsoup.com/{key}
```
