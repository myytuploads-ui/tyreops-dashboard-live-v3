import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAllowedUserIds() {
  const rawAllowlist = process.env.TYREOPS_ALLOWED_USER_IDS?.trim();
  if (!rawAllowlist) return null;

  const userIds = rawAllowlist.split(',').map((id) => id.trim().toLowerCase());
  if (userIds.some((id) => !id || !UUID_PATTERN.test(id))) return null;

  return new Set(userIds);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const publicPath = path === '/login' || path === '/unauthorised';

  if (!user && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (!user) return response;

  const allowedUserIds = getAllowedUserIds();
  const isAllowed = allowedUserIds?.has(user.id.toLowerCase()) === true;

  if (!isAllowed) {
    try {
      await supabase.auth.signOut();
    } catch {}

    if (path === '/unauthorised') return response;

    const url = request.nextUrl.clone();
    url.pathname = '/unauthorised';
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  if (publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
