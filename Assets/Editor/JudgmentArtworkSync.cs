using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEngine;

/// <summary>Keep the approved source artwork in the Resources used by both gameplay and results.</summary>
public sealed class JudgmentArtworkSync : IPreprocessBuildWithReport
{
    public int callbackOrder => -100;
    public void OnPreprocessBuild(BuildReport report) => Synchronize();

    [MenuItem("Shredder/Atualizar imagens de julgamento")]
    public static void Synchronize()
    {
        string root = Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
        foreach (string name in new[] { "perfeito", "otimo", "bom", "errou" })
        {
            string assetPath = "Assets/Resources/Julgamentos/" + name + ".png";
            string source = Path.Combine(root, "Images/Julgamentos", name + ".png");
            string target = Path.Combine(root, assetPath);
            // Source art may be omitted from a source package; existing Resources remain valid.
            if (File.Exists(source)) File.Copy(source, target, true);
            if (!File.Exists(target)) throw new BuildFailedException("Imagem de julgamento ausente: " + assetPath);
            AssetDatabase.ImportAsset(assetPath, ImportAssetOptions.ForceUpdate);
            if (AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath) == null)
                throw new BuildFailedException("Não foi possível importar a imagem: " + assetPath);
        }
    }
}
