# Live Site Corpus

Edit this table to change the default live-site suite. Keep `id` stable so reruns and reports stay comparable over time.

| id | cohort | site | url | path_mode | expected_url | expected_extension | requires_manual | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| reuters-world | news | Reuters | https://www.reuters.com/world/ | both | blocked_with_extension_hint | manual_review | yes | Server-side URL extraction is blocked and automated browsers often hit a DataDome interstitial first. |
| nytimes-business | news | New York Times | https://www.nytimes.com/section/business | both | blocked_with_extension_hint | manual_review | yes | Metered/personalized behavior can drift. |
| washingtonpost-business | news | Washington Post | https://www.washingtonpost.com/business/ | extension_primary | blocked_with_extension_hint | manual_review | yes | Frequently bot-guarded or meter-guarded. |
| cnn-business | news | CNN | https://www.cnn.com/business | both | ready | ready | no | Good large-site regression check. |
| fox-business | news | Fox News | https://www.foxnews.com/category/business | both | ready | ready | no | Public article category page. |
| usatoday-money | news | USA Today | https://www.usatoday.com/money/ | both | ready | ready | no | Public business/news landing page. |
| cnbc-business | news | CNBC | https://www.cnbc.com/business/ | both | ready | ready | no | Public business coverage. |
| forbes-business | news | Forbes | https://www.forbes.com/business/ | both | blocked_with_extension_hint | manual_review | yes | Metered and anti-bot behavior can drift. |
| fortune-home | news | Fortune | https://fortune.com/ | both | blocked_with_extension_hint | manual_review | yes | Often needs browser capture for stable extraction. |
| yahoo-news | news | Yahoo News | https://news.yahoo.com/ | both | ready | ready | no | Broad public news surface. |
| linkedin-pulse | social | LinkedIn | https://www.linkedin.com/pulse/ | extension_primary | blocked_with_extension_hint | manual_review | yes | Public professional surface; login walls vary. |
| x-openai | social | X | https://x.com/OpenAI | extension_primary | blocked_with_extension_hint | manual_review | yes | Conservative-host handling is the key regression signal. |
| reddit-openai | social | Reddit | https://www.reddit.com/r/OpenAI/ | extension_primary | blocked_with_extension_hint | manual_review | yes | Conservative-host handling and page noise. |
| facebook-meta | social | Facebook | https://www.facebook.com/Meta | extension_primary | blocked_with_extension_hint | manual_review | yes | Public page behavior often shifts. |
| threads-instagram | social | Threads | https://www.threads.net/@instagram | extension_primary | blocked_with_extension_hint | manual_review | yes | Dynamic/public availability shifts. |
| bluesky-openai | social | Bluesky | https://bsky.app/profile/openai.com | both | ready | manual_review | yes | Public text surface; app shell changes frequently. |
| medium-technology | social | Medium | https://medium.com/tag/technology | both | ready | ready | no | Text-heavy public surface. |
| substack-tech | social | Substack | https://substack.com/home | both | ready | ready | no | Public text-heavy surface. |
| hackernews-frontpage | social | Hacker News | https://news.ycombinator.com/ | both | ready | ready | no | Public minimalist baseline. |
| quora-business | social | Quora | https://www.quora.com/topic/Business | extension_primary | blocked_with_extension_hint | manual_review | yes | Public/logged-out behavior changes often. |
