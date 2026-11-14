using UnityEngine;

/// <summary>Code-native cutout portraits: twin astral automaton and copper manuscript judge.</summary>
public static class BossPersonaArt
{
    private const int Size = 256;
    public static Sprite Frame(bool twins, bool ascended, float motion, int action)
    {
        var pixels = new Color32[Size * Size];
        Color ink = new Color(.055f, .045f, .095f);
        Color metal = twins ? new Color(.14f, .2f, .42f) : new Color(.29f, .13f, .12f);
        Color light = twins ? new Color(.38f, .78f, 1f) : new Color(1f, .64f, .39f);
        Color other = twins ? new Color(.74f, .39f, 1f) : new Color(.96f, .87f, .68f);
        if (ascended) { light = other; metal = Color.Lerp(metal, light, .2f); }
        int sway = Mathf.RoundToInt(Mathf.Sin(motion * Mathf.PI * 2) * 3);
        void Disc(int cx, int cy, int radius, Color color)
        {
            for (int y = Mathf.Max(0, cy - radius); y <= Mathf.Min(Size - 1, cy + radius); y++)
                for (int x = Mathf.Max(0, cx - radius); x <= Mathf.Min(Size - 1, cx + radius); x++)
                    if ((x-cx)*(x-cx)+(y-cy)*(y-cy) <= radius*radius) pixels[y*Size+x] = color;
        }
        void Line(int x, int y, int xx, int yy, int width, Color color)
        {
            int steps = Mathf.Max(Mathf.Abs(xx-x), Mathf.Abs(yy-y));
            for (int k = 0; k <= steps; k++)
            {
                float t = steps == 0 ? 0 : (float)k/steps;
                Disc(Mathf.RoundToInt(Mathf.Lerp(x,xx,t)), Mathf.RoundToInt(Mathf.Lerp(y,yy,t)),width,color);
            }
        }
        void Poly(Color color, params Vector2[] points)
        {
            Vector2 min = points[0], max = points[0];
            foreach (var point in points) { min = Vector2.Min(min, point); max = Vector2.Max(max, point); }
            for (int y = Mathf.Max(0, Mathf.FloorToInt(min.y)); y <= Mathf.Min(Size-1, Mathf.CeilToInt(max.y)); y++)
                for (int x = Mathf.Max(0, Mathf.FloorToInt(min.x)); x <= Mathf.Min(Size-1, Mathf.CeilToInt(max.x)); x++)
                {
                    bool inside = false;
                    for (int i = 0, j = points.Length-1; i < points.Length; j = i++)
                        if ((points[i].y > y) != (points[j].y > y)
                            && x < (points[j].x-points[i].x)*(y-points[i].y)/(points[j].y-points[i].y)+points[i].x)
                            inside = !inside;
                    if (inside) pixels[y*Size+x] = color;
                }
        }
        // Broken halo and orbiting runes leave the center silhouette readable.
        for (int i = 0; i < 12; i++)
        {
            float angle = (i/12f + motion*.025f)*Mathf.PI*2;
            int x = 128 + Mathf.RoundToInt(Mathf.Cos(angle)*94);
            int y = 144 + Mathf.RoundToInt(Mathf.Sin(angle)*94);
            Line(x-3,y,x+3,y,1,i%2 == 0 ? light : other);
            if (!twins) Line(x,y-4,x,y+4,1,other);
        }
        Poly(ink,new Vector2(48,29),new Vector2(73,139),new Vector2(115,159),new Vector2(162,146),new Vector2(206,30),new Vector2(128,14));
        Poly(metal,new Vector2(60,34),new Vector2(84,133),new Vector2(128,152),new Vector2(171,130),new Vector2(193,34),new Vector2(128,22));
        Line(128,31,128,130,2,light);
        for (int i=0;i<4;i++)
        {
            Line(85+i*3,48+i*17,115,57+i*17,1,other);
            Line(140,57+i*17,170-i*3,48+i*17,1,light);
        }
        if (twins)
        {
            for (int face=0;face<2;face++)
            {
                int x = face == 0 ? 102 : 152;
                int y = 172 + (face == 0 ? sway : -sway);
                Disc(x,y,33,ink); Disc(x,y,28,face == 0 ? metal : new Color(.27f,.14f,.39f));
                Poly(face == 0 ? light : other,new Vector2(x-20,y+4),new Vector2(x+17,y+4),new Vector2(x+9,y-3),new Vector2(x-14,y-3));
                Line(x-8,y-14,x+9,y-14,1,other);
                Poly(light,new Vector2(x-22,y+23),new Vector2(x-15,y+53),new Vector2(x-5,y+27));
            }
            // Four pointed star, shared by the two thinking halves.
            Poly(other,new Vector2(128,134),new Vector2(134,118),new Vector2(151,112),new Vector2(134,106),new Vector2(128,89),new Vector2(122,106),new Vector2(105,112),new Vector2(122,118));
        }
        else
        {
            Poly(ink,new Vector2(83,157),new Vector2(91,210+sway),new Vector2(128,230+sway),new Vector2(166,208+sway),new Vector2(178,153));
            Poly(other,new Vector2(103,199+sway),new Vector2(127,214+sway),new Vector2(153,196+sway),new Vector2(148,156+sway),new Vector2(128,143+sway),new Vector2(108,159+sway));
            Line(112,182+sway,121,179+sway,2,ink); Line(136,179+sway,145,182+sway,2,ink);
            Line(121,161+sway,136,161+sway,1,metal);
            // Floating open codex and copper quill.
            Poly(other,new Vector2(55,93),new Vector2(90,85),new Vector2(122,94),new Vector2(121,57),new Vector2(89,48),new Vector2(54,58));
            Line(89,50,90,82,1,metal);
            for (int i=0;i<3;i++) Line(59,64+i*7,81,59+i*7,1,metal);
            Line(177,63,199,127,2,light); Line(191,105,207,126,3,other);
        }
        // Visible anticipation, discharge, recoil and dissolution states.
        if (action == 1 || action == 2)
        {
            int radius = action == 1 ? 7 + Mathf.RoundToInt(motion*10) : 12 + Mathf.RoundToInt(motion*22);
            Disc(204,143,radius,metal); Disc(204,143,Mathf.Max(2,radius-4),light);
            Line(178,101,198,131,4,other);
        }
        if (action == 3) { Line(61,153,196,209,3,light); Line(62,209,196,153,3,other); }
        if (action == 4)
            for (int i=0;i<pixels.Length;i++) { var c=pixels[i]; c.a=(byte)(c.a*(1-motion)); pixels[i]=c; }
        var texture = new Texture2D(Size,Size,TextureFormat.RGBA32,false) { name = "Boss persona frame", filterMode = FilterMode.Bilinear };
        texture.SetPixels32(pixels); texture.Apply(false,true);
        return Sprite.Create(texture,new Rect(0,0,Size,Size),new Vector2(.5f,.5f),100);
    }
}
