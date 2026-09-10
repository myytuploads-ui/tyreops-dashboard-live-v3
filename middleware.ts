import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAllowedUserId } from '@/lib/auth/allowed-users';

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
  const isOgImage = path === '/opengraph-image' || path === '/twitter-image' || path.startsWith('/opengraph-image') || path.startsWith('/twitter-image');
  const publicPath = path === '/login' || path === '/unauthorised' || isOgImage;

  // State-changing API routes enforce their own session and allowlist checks.
  if (path.startsWith('/api/')) return response;

  if (!user && !publicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (!user) return response;

  const isAllowed = isAllowedUserId(user.id);

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

  if (publicPath && !isOgImage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
