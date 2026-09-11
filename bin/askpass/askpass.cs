using System;
using System.IO;

class Program {
    static void Main() {
        string file = Environment.GetEnvironmentVariable("PASS_FILE_FOR_SSH");
        if (!string.IsNullOrEmpty(file) && File.Exists(file)) {
            Console.Write(File.ReadAllText(file));
            return;
        }
        string pass = Environment.GetEnvironmentVariable("PASS_FOR_SSH");
        if (!string.IsNullOrEmpty(pass)) {
            Console.Write(pass);
        }
    }
}
